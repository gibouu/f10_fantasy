import Foundation
import XCTest
@testable import FXRacing

@MainActor
final class RaceDetailViewModelTests: XCTestCase {
    func testSummaryIsPublishedBeforeLoadStarts() {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)

        XCTAssertEqual(viewModel.race.id, RaceFixtures.upcoming.id)
        XCTAssertTrue(viewModel.entrants.isEmpty)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertEqual(viewModel.submissionState, .idle)
    }

    func testCancelLoadRejectsLatePublicAndPrivateHydration() async {
        let api = GatedAPIClientSpy(
            responses: [
                detailKey: [.json(makePayload(entrants: refreshedDrivers))],
                pickKey: [.json(PickResponse(pick: serverPick))],
            ],
            gatedKeys: [detailKey, pickKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()
        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        await api.waitForCalls(to: pickPath, count: 1)

        viewModel.cancelLoad()

        XCTAssertFalse(viewModel.isLoading)
        await api.releaseRequests(to: detailPath)
        await api.releaseRequests(to: pickPath)
        await load.value
        XCTAssertTrue(viewModel.entrants.isEmpty)
        XCTAssertNil(viewModel.serverPick)
    }

    func testCachedDetailPublishesWhilePublicAndPrivateRequestsRunConcurrently() async throws {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [
                detailKey: [.json(makePayload(entrants: refreshedDrivers))],
                pickKey: [.json(PickResponse(pick: serverPick))],
            ],
            gatedKeys: [detailKey, pickKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()

        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        await api.waitForCalls(to: pickPath, count: 1)

        XCTAssertEqual(viewModel.entrants.map(\.id), drivers.map(\.id))
        XCTAssertEqual(viewModel.race.id, raceID)

        await api.releaseRequests(to: detailPath)
        await api.releaseRequests(to: pickPath)
        await load.value
    }

    func testCachedEntrantsUnlockPrivatePickBeforePublicRefreshFinishes() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [
                detailKey: [.json(makePayload(entrants: refreshedDrivers))],
                pickKey: [.json(PickResponse(pick: serverPick))],
            ],
            gatedKeys: [detailKey, pickKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()
        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        await api.waitForCalls(to: pickPath, count: 1)

        await api.releaseRequests(to: pickPath)
        for _ in 0..<20 where viewModel.serverPick == nil {
            await Task.yield()
        }

        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.selectedWinner?.id, serverPick.winnerDriverId)
        XCTAssertTrue(viewModel.isLoading)

        await api.releaseRequests(to: detailPath)
        await load.value
    }

    func testConfirmedAccountPickHydratesAfterEntrantsBeforePrivate404Completes() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.notFound)]],
            gatedKeys: [pickKey]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: record.id, revision: record.revision, to: .confirmed)
        )

        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: pickPath, count: 1)

        for _ in 0..<20 where viewModel.entrants.isEmpty {
            await Task.yield()
        }

        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)

        await api.releaseRequests(to: pickPath)
        await load.value
        assertDeviceSelection(on: viewModel)
        XCTAssertNil(viewModel.loadErrorMessage)
    }

    func testPrivate5xxPreservesConfirmedOwnerScopedLocalPick() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.serverError(503, "unavailable"))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: record.id, revision: record.revision, to: .confirmed)
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertNil(viewModel.loadErrorMessage)
    }

    func testPrivate401PreservesDirtyDraftAndReportsRejectedToken() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.unauthorized)]]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        let store = makeStore()
        var rejectedTokens: [String] = []
        syncManager.setUnauthorizedHandler { rejectedTokens.append($0) }
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let record = try saveRecord(in: store, owner: .user("user-a"))

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: record.id)?.syncState, .queued)
        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertEqual(rejectedTokens, ["token-a"])
    }

    func testPublicFailureRetainsCachedDetailAndExposesRetryError() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [detailKey: [.failure(.serverError(503, "down"))]]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)

        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: makeStore()
        )

        XCTAssertEqual(viewModel.entrants.map(\.id), drivers.map(\.id))
        XCTAssertNotNil(viewModel.loadErrorMessage)
        XCTAssertEqual(viewModel.race.id, raceID)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testPublicFailureWithoutCacheRetainsSummaryAndExposesRetryError() async {
        let api = GatedAPIClientSpy(
            responses: [detailKey: [.failure(.serverError(503, "down"))]]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)

        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: makeStore()
        )

        XCTAssertEqual(viewModel.race.id, raceID)
        XCTAssertTrue(viewModel.entrants.isEmpty)
        XCTAssertNotNil(viewModel.loadErrorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testSyncingAndExpiredLocalStatesMapExactly() async throws {
        let syncingStore = makeStore()
        let syncingRecord = try saveRecord(
            in: syncingStore,
            owner: .user("user-a")
        )
        XCTAssertTrue(
            syncingStore.transition(
                id: syncingRecord.id,
                revision: syncingRecord.revision,
                to: .syncing(
                    revision: syncingRecord.revision,
                    mode: .authenticatedRetry
                )
            )
        )
        let syncingViewModel = makeViewModel(
            api: GatedAPIClientSpy(responses: [:])
        )
        await syncingViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: syncingStore
        )
        XCTAssertEqual(syncingViewModel.submissionState, .syncing)

        let expiredStore = makeStore()
        let expiredRecord = try saveRecord(
            in: expiredStore,
            owner: .user("user-a")
        )
        XCTAssertTrue(
            expiredStore.transition(
                id: expiredRecord.id,
                revision: expiredRecord.revision,
                to: .expired
            )
        )
        let expiredViewModel = makeViewModel(
            api: GatedAPIClientSpy(responses: [:])
        )
        await expiredViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: expiredStore
        )
        XCTAssertEqual(expiredViewModel.submissionState, .expired)
    }

    func testOtherUserAndLegacyRecordsAreNeverDisplayed() async throws {
        let accountStore = makeStore()
        _ = try saveRecord(in: accountStore, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.notFound)]]
        )
        let accountViewModel = makeViewModel(api: api)
        await accountViewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-b",
            localPickStore: accountStore
        )
        XCTAssertNil(accountViewModel.selectedWinnerID)
        XCTAssertEqual(accountViewModel.submissionState, .idle)

        let persistence = MemoryPickPersistence()
        let legacy = LegacyLocalPickV1(
            raceId: raceID,
            winnerId: selection.winnerDriverID,
            p10Id: selection.tenthPlaceDriverID,
            dnfId: selection.dnfDriverID,
            savedAt: RaceFixtures.now,
            synced: false
        )
        persistence.setData(
            try JSONEncoder().encode([raceID: legacy]),
            forKey: "localPicks_v1"
        )
        let legacyStore = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let legacyViewModel = makeViewModel(
            api: GatedAPIClientSpy(responses: [:])
        )
        await legacyViewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: legacyStore
        )
        XCTAssertNil(legacyViewModel.selectedWinnerID)
        XCTAssertEqual(legacyViewModel.submissionState, .idle)
    }

    func testObservedStoreTransitionReconcilesImmediatelyAfterLoad() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)

        XCTAssertTrue(
            store.transition(id: record.id, revision: record.revision, to: .confirmed)
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        assertDeviceSelection(on: viewModel)
    }

    func testObservedConfirmedRevisionKeepsSeparateServerAuthority() async {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)

        guard case .saved(let newer) = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .user("user-a"),
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a newer local revision")
        }
        XCTAssertTrue(
            store.transition(id: newer.id, revision: newer.revision, to: .confirmed)
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.officialWinner?.id, serverPick.winnerDriverId)
    }

    func testStalePrivatePickCannotReplaceANewerExternallyConfirmedRevision() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]],
            gatedKeys: [pickKey]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let original = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: original.id, revision: original.revision, to: .confirmed)
        )

        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: pickPath, count: 1)

        guard case .saved(let newer) = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .user("user-a"),
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a newer local revision")
        }
        XCTAssertTrue(
            store.transition(id: newer.id, revision: newer.revision, to: .confirmed)
        )

        await api.releaseRequests(to: pickPath)
        await load.value

        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertNil(viewModel.serverPick)
    }

    func testEntrantRefreshReconcilesDirtySelectionsByStableID() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [detailKey: [.json(makePayload(entrants: refreshedDrivers))]],
            gatedKeys: [detailKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()
        let load = Task {
            await viewModel.loadIfNeeded(
                token: nil,
                userID: nil,
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        viewModel.select(driver: DriverFixtures.norris, for: .winner)
        viewModel.select(driver: DriverFixtures.piastri, for: .p10)
        viewModel.select(driver: DriverFixtures.leclerc, for: .dnf)

        await api.releaseRequests(to: detailPath)
        await load.value

        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.selectedWinner?.code, "NOR-REFRESHED")
        XCTAssertEqual(viewModel.selectedP10?.code, "PIA-REFRESHED")
        XCTAssertEqual(viewModel.selectedDNF?.code, "LEC-REFRESHED")
    }

    func testCanSaveBecomesFalseWhenASelectedDriverLeavesTheEntrantList() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let remainingDrivers = Array(refreshedDrivers.dropLast())
        let api = GatedAPIClientSpy(
            responses: [detailKey: [.json(makePayload(entrants: remainingDrivers))]],
            gatedKeys: [detailKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()
        let load = Task {
            await viewModel.loadIfNeeded(
                token: nil,
                userID: nil,
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        selectCompleteDraft(on: viewModel)
        XCTAssertTrue(viewModel.canSave)

        await api.releaseRequests(to: detailPath)
        await load.value

        XCTAssertEqual(viewModel.selectedDNFID, DriverFixtures.leclerc.id)
        XCTAssertNil(viewModel.selectedDNF)
        XCTAssertFalse(viewModel.canSave)
    }

    func testLateServerPickCannotOverwriteUnsavedDirtyDraft() async {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]],
            gatedKeys: [pickKey]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: pickPath, count: 1)
        viewModel.select(driver: DriverFixtures.norris, for: .winner)
        await api.releaseRequests(to: pickPath)
        await load.value

        XCTAssertEqual(viewModel.selectedWinner?.id, DriverFixtures.norris.id)
        XCTAssertNil(viewModel.selectedP10)
        XCTAssertNil(viewModel.selectedDNF)
    }

    func testNewerForcedGenerationWinsWhenOlderPrivateResponseFinishesLast() async {
        let oldPick = makePick(
            id: "old",
            winner: DriverFixtures.leclerc.id,
            p10: DriverFixtures.norris.id,
            dnf: DriverFixtures.piastri.id
        )
        let newPick = makePick(
            id: "new",
            winner: DriverFixtures.norris.id,
            p10: DriverFixtures.piastri.id,
            dnf: DriverFixtures.leclerc.id
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: oldPick)),
                    .json(PickResponse(pick: newPick)),
                ],
            ],
            gatedKeys: [pickKey]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()

        let older = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store,
                force: true
            )
        }
        let olderRequest = await api.waitForRequest(to: pickPath, ordinal: 1)
        let newer = Task {
            await viewModel.refresh(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let newerRequest = await api.waitForRequest(to: pickPath, ordinal: 2)

        await api.releaseRequest(id: newerRequest)
        await newer.value
        assertDeviceSelection(on: viewModel)

        await api.releaseRequest(id: olderRequest)
        await older.value
        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.serverPick?.id, newPick.id)
    }

    func testOlderPublicGenerationCannotMutateArraysErrorOrLoading() async {
        let repository = SequencedRaceDetailRepository()
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()

        let older = Task {
            await viewModel.loadIfNeeded(
                token: nil,
                userID: nil,
                localPickStore: store,
                force: true
            )
        }
        await repository.waitForRefresh(1)
        let newer = Task {
            await viewModel.refresh(
                token: nil,
                userID: nil,
                localPickStore: store
            )
        }
        await repository.waitForRefresh(2)

        await repository.succeed(
            2,
            with: makeDetail(
                savedAt: RaceFixtures.now,
                entrants: refreshedDrivers
            )
        )
        await newer.value
        XCTAssertEqual(viewModel.entrants.map(\.code), refreshedDrivers.map(\.code))

        await repository.fail(1, with: .serverError(503, "old"))
        await older.value

        XCTAssertEqual(viewModel.entrants.map(\.code), refreshedDrivers.map(\.code))
        XCTAssertNil(viewModel.loadErrorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testAccountSwitchDuringLoadInvalidatesTheOldFlightAndLoadingState() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [
                detailKey: [.json(makePayload(entrants: refreshedDrivers))],
                pickKey: [.json(PickResponse(pick: serverPick))],
            ],
            gatedKeys: [detailKey, pickKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()

        let load = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        await api.waitForCalls(to: pickPath, count: 1)
        selectCompleteDraft(on: viewModel)

        await viewModel.submit(
            token: "token-b",
            userID: "user-b",
            localPickStore: store
        )

        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.selectedWinnerID)
        XCTAssertNil(
            store.record(
                for: raceID,
                owner: .user("user-b")
            )
        )

        await api.releaseRequests(to: detailPath)
        await api.releaseRequests(to: pickPath)
        await load.value

        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.serverPick)
        XCTAssertNil(viewModel.selectedWinnerID)
    }

    func testConcurrentLoadIfNeededCallersJoinOnePublicAndPrivateFlight() async {
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-301),
            entrants: drivers
        )
        let api = GatedAPIClientSpy(
            responses: [
                detailKey: [.json(makePayload())],
                pickKey: [.failure(.notFound)],
            ],
            gatedKeys: [detailKey, pickKey]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [raceID: cached]),
            clock: TestClock.fixed
        )
        let viewModel = makeViewModel(api: api, repository: repository)
        let store = makeStore()

        let first = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await api.waitForCalls(to: detailPath, count: 1)
        await api.waitForCalls(to: pickPath, count: 1)
        let second = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        await Task.yield()
        await Task.yield()

        let detailCalls = await api.calls(to: detailPath)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(detailCalls, 1)
        XCTAssertEqual(pickCalls, 1)

        await api.releaseRequests(to: detailPath)
        await api.releaseRequests(to: pickPath)
        await first.value
        await second.value
    }

    func testLoadedServerPickSurvivesARepeatedLoadIfNeededCall() async {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 1)
    }

    func testCompletionSummaryTransitionForcesFreshPublicAndPrivateDetail() async throws {
        let liveRace = RaceFixtures.race(
            id: raceID,
            round: 2,
            status: .live,
            startOffset: 0
        )
        let completedRace = RaceFixtures.race(
            id: raceID,
            round: 2,
            status: .completed,
            startOffset: 0
        )
        let livePick = makePick(id: "live-pick")
        let completedPick = makePick(
            id: "completed-pick",
            lockedAt: RaceFixtures.now
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(RaceListPayload(races: [liveRace], season: RaceFixtures.season2026)),
                    .json(RaceListPayload(races: [completedRace], season: RaceFixtures.season2026)),
                ],
                detailKey: [
                    .json(
                        RaceDetailPayload(
                            race: liveRace,
                            entrants: drivers,
                            results: [],
                            qualifyingResults: []
                        )
                    ),
                    .json(
                        RaceDetailPayload(
                            race: completedRace,
                            entrants: refreshedDrivers,
                            results: [],
                            qualifyingResults: []
                        )
                    ),
                ],
                pickKey: [
                    .json(PickResponse(pick: livePick)),
                    .json(PickResponse(pick: completedPick)),
                ],
            ]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )
        let viewModel = RaceDetailViewModel(
            summary: liveRace,
            repository: repository,
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        let store = makeStore()

        _ = try await repository.refreshList(policy: .force)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.serverPick?.id, livePick.id)
        XCTAssertEqual(viewModel.entrants.map(\.code), drivers.map(\.code))

        _ = try await repository.refreshList(policy: .force)
        viewModel.updateSummary(completedRace)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let detailCalls = await api.calls(to: detailPath)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(detailCalls, 2)
        XCTAssertEqual(pickCalls, 2)
        XCTAssertEqual(viewModel.race.status, .completed)
        XCTAssertEqual(viewModel.entrants.map(\.code), refreshedDrivers.map(\.code))
        XCTAssertEqual(viewModel.serverPick?.id, completedPick.id)
    }

    func testCachedDetailCannotUndoSameStatusListCutoffCorrection() async {
        let staleRace = RaceFixtures.upcoming
        let correctedRace = Race(
            id: staleRace.id,
            seasonId: staleRace.seasonId,
            round: staleRace.round,
            name: staleRace.name,
            circuitName: staleRace.circuitName,
            country: staleRace.country,
            type: staleRace.type,
            scheduledStartUtc: staleRace.scheduledStartUtc.addingTimeInterval(3_600),
            lockCutoffUtc: staleRace.lockCutoffUtc.addingTimeInterval(3_600),
            status: staleRace.status,
            qualifyingStartUtc: staleRace.qualifyingStartUtc?.addingTimeInterval(3_600)
        )
        let cachedDetail = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: staleRace,
            entrants: drivers,
            results: [],
            qualifyingResults: []
        )
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = RaceDetailViewModel(
            summary: staleRace,
            repository: ImmediateRaceRepository(detail: cachedDetail),
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        viewModel.updateSummary(correctedRace)

        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: makeStore()
        )

        XCTAssertEqual(viewModel.race.scheduledStartUtc, correctedRace.scheduledStartUtc)
        XCTAssertEqual(viewModel.race.lockCutoffUtc, correctedRace.lockCutoffUtc)
        XCTAssertEqual(viewModel.race.qualifyingStartUtc, correctedRace.qualifyingStartUtc)
        XCTAssertEqual(viewModel.entrants.map(\.id), drivers.map(\.id))
    }

    func testCompletedRaceRefreshesScoredAuthorityForEveryPersistedDirtyState() async throws {
        let completedRace = RaceFixtures.race(
            id: raceID,
            round: 2,
            status: .completed,
            startOffset: -3_600
        )
        let completedDetail = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: completedRace,
            entrants: drivers,
            results: [],
            qualifyingResults: []
        )
        let cachedAuthority = makePick(id: "cached-unscored")
        let scoredAuthority = makePick(
            id: "fresh-scored",
            scoreBreakdown: ScoreBreakdown(
                tenthPlaceScore: 25,
                winnerBonus: 5,
                dnfBonus: 3,
                totalScore: 33
            )
        )
        let states: [(String, LocalPickSyncState)] = [
            ("queued", .queued),
            ("conflict", .conflict(.accountPickFound)),
            ("expired", .expired),
        ]

        for (name, state) in states {
            let store = makeStore()
            let record = try saveRecord(in: store, owner: .user("user-a"))
            if state != .queued {
                XCTAssertTrue(
                    store.transition(
                        id: record.id,
                        revision: record.revision,
                        to: state
                    ),
                    name
                )
            }
            XCTAssertTrue(
                store.preserveAuthoritative(
                    cachedAuthority,
                    for: .user("user-a")
                ),
                name
            )
            let api = GatedAPIClientSpy(
                responses: [
                    pickKey: [.json(PickResponse(pick: scoredAuthority))],
                ]
            )
            let viewModel = RaceDetailViewModel(
                summary: completedRace,
                repository: ImmediateRaceRepository(detail: completedDetail),
                api: api,
                syncManager: SyncManager(api: api, clock: TestClock.fixed),
                clock: TestClock.fixed
            )

            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )

            XCTAssertEqual(
                viewModel.serverPick?.scoreBreakdown?.totalScore,
                33,
                name
            )
            XCTAssertEqual(viewModel.selectedWinnerID, selection.winnerDriverID, name)
            XCTAssertEqual(viewModel.selectedP10ID, selection.tenthPlaceDriverID, name)
            XCTAssertEqual(viewModel.selectedDNFID, selection.dnfDriverID, name)
            let pickCalls = await api.calls(to: pickPath)
            XCTAssertEqual(pickCalls, 1, name)
        }
    }

    func testCompletedRaceRefreshesScoredAuthorityWithoutReplacingUnsavedSelection() async {
        let completedRace = RaceFixtures.race(
            id: raceID,
            round: 2,
            status: .completed,
            startOffset: -3_600
        )
        let completedDetail = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: completedRace,
            entrants: drivers,
            results: [],
            qualifyingResults: []
        )
        let cachedAuthority = makePick(id: "cached-unscored")
        let scoredAuthority = makePick(
            id: "fresh-scored",
            scoreBreakdown: ScoreBreakdown(
                tenthPlaceScore: 25,
                winnerBonus: 5,
                dnfBonus: 3,
                totalScore: 33
            )
        )
        let store = makeStore()
        XCTAssertTrue(
            store.preserveAuthoritative(
                cachedAuthority,
                for: .user("user-a")
            )
        )
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: scoredAuthority))]]
        )
        let viewModel = RaceDetailViewModel(
            summary: RaceFixtures.upcoming,
            repository: ImmediateRaceRepository(detail: completedDetail),
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        selectCompleteDraft(on: viewModel)
        viewModel.updateSummary(completedRace)

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.serverPick?.scoreBreakdown?.totalScore, 33)
        XCTAssertEqual(viewModel.selectedWinnerID, selection.winnerDriverID)
        XCTAssertEqual(viewModel.selectedP10ID, selection.tenthPlaceDriverID)
        XCTAssertEqual(viewModel.selectedDNFID, selection.dnfDriverID)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 1)
    }

    func testCompletedRaceExposesExpiredLocalSelectionOnlyAsUnsubmittedDeviceDraft() async throws {
        let completedRace = RaceFixtures.race(
            id: raceID,
            round: 2,
            status: .completed,
            startOffset: -3_600
        )
        let completedDetail = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: completedRace,
            entrants: drivers,
            results: [],
            qualifyingResults: []
        )
        let scoredAuthority = makePick(
            id: "official-scored-pick",
            winner: alternateSelection.winnerDriverID,
            p10: alternateSelection.tenthPlaceDriverID,
            dnf: alternateSelection.dnfDriverID,
            scoreBreakdown: ScoreBreakdown(
                tenthPlaceScore: 25,
                winnerBonus: 5,
                dnfBonus: 3,
                totalScore: 33
            )
        )
        let store = makeStore()
        let deviceRecord = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(store.transition(
            id: deviceRecord.id,
            revision: deviceRecord.revision,
            to: .expired
        ))
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: scoredAuthority))]]
        )
        let viewModel = RaceDetailViewModel(
            summary: completedRace,
            repository: ImmediateRaceRepository(detail: completedDetail),
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.unsubmittedDeviceDraft, selection)
        XCTAssertEqual(viewModel.serverPick?.id, scoredAuthority.id)
        XCTAssertEqual(viewModel.serverPick?.scoreBreakdown?.totalScore, 33)
        XCTAssertEqual(viewModel.officialWinner?.id, alternateSelection.winnerDriverID)
        XCTAssertEqual(viewModel.selectedWinnerID, selection.winnerDriverID)
    }

    func testForcedRefreshPrivateFailureDoesNotRevertToStaleConfirmedLocalIDs() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: serverPick)),
                    .failure(.serverError(503, "unavailable")),
                ],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let local = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: local.id, revision: local.revision, to: .confirmed)
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.selectedWinnerID, serverPick.winnerDriverId)

        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(viewModel.selectedWinnerID, serverPick.winnerDriverId)
        XCTAssertEqual(viewModel.selectedP10ID, serverPick.tenthPlaceDriverId)
        XCTAssertEqual(viewModel.selectedDNFID, serverPick.dnfDriverId)
        XCTAssertNil(viewModel.loadErrorMessage)
    }

    func testServerPickReconcilesConfirmedLocalBaselineBeforeResubmit() async throws {
        let savedDevicePick = makePick(id: "saved-device")
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.json(PickResponse(pick: serverPick))],
                "POST /api/picks": [.json(PickResponse(pick: savedDevicePick))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let local = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: local.id, revision: local.revision, to: .confirmed)
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let reconciled = try XCTUnwrap(store.record(id: local.id))
        XCTAssertEqual(
            reconciled.selection,
            PickSelection(
                winnerDriverID: serverPick.winnerDriverId,
                tenthPlaceDriverID: serverPick.tenthPlaceDriverId,
                dnfDriverID: serverPick.dnfDriverId
            )
        )
        XCTAssertEqual(reconciled.syncState, .confirmed)

        selectCompleteDraft(on: viewModel)
        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.contains { $0.method == "POST" })
        XCTAssertEqual(store.record(id: local.id)?.selection, selection)
        XCTAssertEqual(store.record(id: local.id)?.syncState, .confirmed)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testOnlineAccountPickRestoresFromAuthoritativeCacheForOfflineColdViewModel() async {
        let store = makeStore()
        let onlineAPI = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]]
        )
        let onlineViewModel = makeViewModel(api: onlineAPI)

        await onlineViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))
        XCTAssertEqual(
            store.authoritativePick(
                for: raceID,
                owner: .user("user-a")
            )?.id,
            serverPick.id
        )

        let offlineAPI = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.serverError(503, "offline"))]]
        )
        let offlineViewModel = makeViewModel(api: offlineAPI)
        await offlineViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(offlineViewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(offlineViewModel.selectedWinnerID, serverPick.winnerDriverId)
        XCTAssertEqual(offlineViewModel.selectedP10ID, serverPick.tenthPlaceDriverId)
        XCTAssertEqual(offlineViewModel.selectedDNFID, serverPick.dnfDriverId)
        XCTAssertEqual(offlineViewModel.submissionState, .savedToAccount)
    }

    func testResubmitForcesANewRevisionAfterServerBaselineCacheFailure() async throws {
        let savedDevicePick = makePick(id: "saved-after-retry")
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.json(PickResponse(pick: serverPick))],
                "POST /api/picks": [.json(PickResponse(pick: savedDevicePick))],
            ]
        )
        let persistence = MemoryPickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let local = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: local.id, revision: local.revision, to: .confirmed)
        )
        persistence.rejectsWrites = true
        let viewModel = makeViewModel(api: api)

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(store.record(id: local.id)?.selection, selection)
        XCTAssertEqual(viewModel.selectedWinnerID, serverPick.winnerDriverId)

        persistence.rejectsWrites = false
        selectCompleteDraft(on: viewModel)
        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.contains { $0.method == "POST" })
        XCTAssertGreaterThan(store.record(id: local.id)?.revision ?? 0, local.revision)
        XCTAssertEqual(store.record(id: local.id)?.syncState, .confirmed)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testPrivate404KeepsDeviceSelectionButRequiresExplicitAccountRepair() async throws {
        let repairedPick = makePick(id: "repaired-account-pick")
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: serverPick)),
                    .failure(.notFound),
                ],
                "POST /api/picks": [.json(PickResponse(pick: repairedPick))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let local = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: local.id, revision: local.revision, to: .confirmed)
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(viewModel.serverPick)
        XCTAssertEqual(viewModel.selectedWinnerID, serverPick.winnerDriverId)
        XCTAssertEqual(viewModel.selectedP10ID, serverPick.tenthPlaceDriverId)
        XCTAssertEqual(viewModel.selectedDNFID, serverPick.dnfDriverId)
        XCTAssertEqual(viewModel.submissionState, .missingFromAccount)

        let missingRevision = try XCTUnwrap(
            store.record(for: raceID, owner: .user("user-a"))?.revision
        )
        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertGreaterThan(
            store.record(for: raceID, owner: .user("user-a"))?.revision ?? 0,
            missingRevision
        )
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.syncState,
            .confirmed
        )
        XCTAssertEqual(viewModel.serverPick?.id, repairedPick.id)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["GET", "GET", "POST"])
    }

    func testAuthoritativePrivate404ClearsOnlyAStaleServerOnlyPick() async {
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: serverPick)),
                    .failure(.notFound),
                ],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)

        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(viewModel.serverPick)
        XCTAssertNil(viewModel.selectedWinnerID)
        XCTAssertNil(viewModel.selectedP10ID)
        XCTAssertNil(viewModel.selectedDNFID)
        XCTAssertEqual(viewModel.submissionState, .idle)
    }

    func testAuthenticatedExplicitSavePersistsBeforePOSTAndConfirmsMatchingRevision() async throws {
        let responsePick = makePick(id: "saved")
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.json(PickResponse(pick: responsePick))]],
            gatedKeys: ["POST /api/picks"]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        let save = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )
        let id = LocalPickRecordID(owner: .user("user-a"), raceID: raceID)
        let persisted = try XCTUnwrap(store.record(id: id))

        XCTAssertEqual(
            persisted.syncState,
            .syncing(revision: persisted.revision, mode: .direct)
        )
        XCTAssertEqual(viewModel.submissionState, .syncing)

        await api.releaseRequest(id: requestID)
        await save.value

        XCTAssertEqual(store.record(id: id)?.syncState, .confirmed)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertEqual(viewModel.serverPick?.id, responsePick.id)
    }

    func testLocalSaveCallbackPublishesBeforeGatedAccountRequestCompletes() async {
        let responsePick = makePick(id: "saved-after-local-publication")
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: responsePick))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )
        var callbackState: PickSubmissionState?

        let save = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store,
                onLocalSavePublished: {
                    callbackState = viewModel.submissionState
                }
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        XCTAssertEqual(callbackState, .savedOnDevice)
        XCTAssertEqual(viewModel.submissionState, .syncing)

        await api.releaseRequest(id: requestID)
        await save.value
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testRepeatedSaveWhilePOSTIsInFlightKeepsOneRevisionAndRequest() async throws {
        let responsePick = makePick(id: "saved-once")
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.json(PickResponse(pick: serverPick))],
                "POST /api/picks": [.json(PickResponse(pick: responsePick))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        selectCompleteDraft(on: viewModel)

        let first = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )
        let id = LocalPickRecordID(owner: .user("user-a"), raceID: raceID)
        let firstRevision = try XCTUnwrap(store.record(id: id)?.revision)

        let second = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        for _ in 0..<20 {
            await Task.yield()
        }
        XCTAssertEqual(store.record(id: id)?.revision, firstRevision)

        await api.releaseRequest(id: requestID)
        await first.value
        await second.value

        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 1)
        XCTAssertEqual(store.record(id: id)?.syncState, .confirmed)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testAuthenticatedExplicitNetworkFailureLeavesQueuedDeviceSave() async {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [
                    .failure(.networkFailed(OfflineError())),
                ],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let id = LocalPickRecordID(owner: .user("user-a"), raceID: raceID)
        XCTAssertEqual(store.record(id: id)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertNotNil(viewModel.submissionErrorMessage)
        XCTAssertNil(viewModel.serverPick)

        guard let queued = store.record(id: id) else {
            return XCTFail("Expected a queued local record")
        }
        XCTAssertTrue(
            store.transition(id: id, revision: queued.revision, to: .confirmed)
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertNil(viewModel.submissionErrorMessage)
    }

    func testPersistenceFailureNeverPublishesDeviceOrAccountSuccess() async {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = LocalPickStore(
            persistence: RejectingPickPersistence(),
            clock: TestClock.fixed
        )
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: nil,
            userID: nil,
            store: store
        )

        await viewModel.submit(
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertEqual(viewModel.submissionState, .idle)
        XCTAssertNotNil(viewModel.submissionErrorMessage)
        XCTAssertNil(store.record(for: raceID, owner: .guest))
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testUnchangedConfirmedSubmitStaysSavedWithoutPOST() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.serverError(503, "unavailable"))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(id: record.id, revision: record.revision, to: .confirmed)
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        let requests = await api.recordedRequests()
        XCTAssertFalse(requests.contains { $0.method == "POST" })
    }

    func testExactCutoffAndDuplicateDriversCannotBeSaved() async {
        let api = GatedAPIClientSpy(responses: [:])
        let cutoffRace = Race(
            id: raceID,
            seasonId: RaceFixtures.upcoming.seasonId,
            round: RaceFixtures.upcoming.round,
            name: RaceFixtures.upcoming.name,
            circuitName: RaceFixtures.upcoming.circuitName,
            country: RaceFixtures.upcoming.country,
            type: RaceFixtures.upcoming.type,
            scheduledStartUtc: RaceFixtures.upcoming.scheduledStartUtc,
            lockCutoffUtc: RaceFixtures.now,
            status: RaceFixtures.upcoming.status,
            qualifyingStartUtc: RaceFixtures.upcoming.qualifyingStartUtc
        )
        let cutoffDetail = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: cutoffRace,
            entrants: drivers,
            results: [],
            qualifyingResults: []
        )
        let cutoffViewModel = RaceDetailViewModel(
            summary: cutoffRace,
            repository: ImmediateRaceRepository(detail: cutoffDetail),
            api: api,
            syncManager: SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
        selectCompleteDraft(on: cutoffViewModel)
        XCTAssertFalse(cutoffViewModel.canSave)
        XCTAssertNil(cutoffViewModel.selectedWinnerID)

        let duplicateViewModel = makeViewModel(api: GatedAPIClientSpy(responses: [:]))
        await duplicateViewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: makeStore()
        )
        duplicateViewModel.select(driver: DriverFixtures.norris, for: .winner)
        duplicateViewModel.select(driver: DriverFixtures.norris, for: .p10)
        duplicateViewModel.select(driver: DriverFixtures.norris, for: .dnf)
        XCTAssertFalse(duplicateViewModel.canSave)
    }

    func testServerLockedPickRejectsSelectionWithoutAdvancingTheDraft() async {
        let lockedPick = makePick(
            id: "locked",
            lockedAt: RaceFixtures.now.addingTimeInterval(-1)
        )
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: lockedPick))]]
        )
        let viewModel = makeViewModel(api: api)

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: makeStore()
        )

        XCTAssertTrue(viewModel.isPickLocked)
        XCTAssertFalse(
            viewModel.select(driver: DriverFixtures.piastri, for: .winner)
        )
        XCTAssertEqual(viewModel.selectedWinnerID, lockedPick.winnerDriverId)
        XCTAssertFalse(viewModel.canSave)
    }

    func testExternalNewerRevisionDuringPOSTDoesNotLeaveViewModelSyncing() async {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: makePick(id: "old")))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        let save = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        guard case .saved(let newer) = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .user("user-a"),
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected an external newer revision")
        }
        await api.releaseRequest(id: requestID)
        await save.value

        XCTAssertEqual(store.record(id: newer.id)?.revision, newer.revision)
        XCTAssertEqual(
            viewModel.selectedWinnerID,
            alternateSelection.winnerDriverID
        )
        XCTAssertEqual(
            viewModel.selectedP10ID,
            alternateSelection.tenthPlaceDriverID
        )
        XCTAssertEqual(
            viewModel.selectedDNFID,
            alternateSelection.dnfDriverID
        )
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
    }

    func testDirtyGuestDraftOutranksAnOlderConfirmedAccountRecord() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let accountRecord = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(
                id: accountRecord.id,
                revision: accountRecord.revision,
                to: .confirmed
            )
        )
        guard case .saved(let guestRecord) = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a guest draft")
        }

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 1)

        XCTAssertTrue(
            store.transition(
                id: guestRecord.id,
                revision: guestRecord.revision,
                to: .conflict(.serverWins)
            )
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .conflict)
    }

    func testConfirmedGuestMigrationStaysAheadOfAnOlderAccountBaseline() async throws {
        let migratedPick = makePick(
            id: "migrated",
            winner: alternateSelection.winnerDriverID,
            p10: alternateSelection.tenthPlaceDriverID,
            dnf: alternateSelection.dnfDriverID
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .failure(.notFound),
                    .json(PickResponse(pick: migratedPick)),
                ],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let accountRecord = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(
                id: accountRecord.id,
                revision: accountRecord.revision,
                to: .confirmed
            )
        )
        let accountBRecord = try saveRecord(in: store, owner: .user("user-b"))
        XCTAssertTrue(
            store.transition(
                id: accountBRecord.id,
                revision: accountBRecord.revision,
                to: .confirmed
            )
        )
        guard case .saved(let guestRecord) = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a guest draft")
        }

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)

        await SyncManager(api: api, clock: TestClock.fixed).resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertEqual(store.record(id: guestRecord.id)?.syncState, .confirmed)
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.selection,
            alternateSelection
        )

        let accountBViewModel = makeViewModel(
            api: GatedAPIClientSpy(responses: [:])
        )
        await accountBViewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-b",
            localPickStore: store
        )
        assertDeviceSelection(on: accountBViewModel)
        XCTAssertEqual(accountBViewModel.submissionState, .missingFromAccount)
        XCTAssertNil(accountBViewModel.serverPick)
    }

    func testExplicitOldAccountSelectionSupersedesDirtyGuestMigration() async throws {
        let guestPick = makePick(id: "guest-upload")
        let accountPick = makePick(
            id: "account-explicit",
            winner: alternateSelection.winnerDriverID,
            p10: alternateSelection.tenthPlaceDriverID,
            dnf: alternateSelection.dnfDriverID
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.failure(.notFound)],
                "POST /api/picks": [
                    .json(PickResponse(pick: guestPick)),
                    .json(PickResponse(pick: accountPick)),
                ],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        let accountRecord = try saveRecord(
            in: store,
            owner: .user("user-a"),
            selection: alternateSelection
        )
        XCTAssertTrue(
            store.transition(
                id: accountRecord.id,
                revision: accountRecord.revision,
                to: .confirmed
            )
        )
        guard case .saved = store.save(
            selection: selection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a dirty guest draft")
        }

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertDeviceSelection(on: viewModel)

        let migration = Task {
            await syncManager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: store
            )
        }
        let guestRequestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        viewModel.select(driver: DriverFixtures.piastri, for: .winner)
        viewModel.select(driver: DriverFixtures.leclerc, for: .p10)
        viewModel.select(driver: DriverFixtures.norris, for: .dnf)
        let explicit = Task {
            await viewModel.submit(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        for _ in 0..<20 where
            store.record(id: accountRecord.id)?.revision == accountRecord.revision {
            await Task.yield()
        }
        XCTAssertGreaterThan(
            store.record(id: accountRecord.id)?.revision ?? 0,
            accountRecord.revision
        )

        await api.releaseRequest(id: guestRequestID)
        let accountRequestID = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 2
        )
        await api.releaseRequest(id: accountRequestID)
        await migration.value
        await explicit.value

        XCTAssertEqual(store.record(id: accountRecord.id)?.selection, alternateSelection)
        XCTAssertEqual(store.record(id: accountRecord.id)?.syncState, .confirmed)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 2)
    }

    func testAuthenticatedConflictDraftSurvivesPrivateServerPick() async throws {
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(
            store.transition(
                id: record.id,
                revision: record.revision,
                to: .conflict(.accountPickFound)
            )
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .conflict)
        XCTAssertEqual(store.record(id: record.id)?.syncState, .conflict(.accountPickFound))
        XCTAssertEqual(viewModel.serverPick?.id, serverPick.id)
        XCTAssertEqual(
            store.authoritativePick(for: raceID, owner: .user("user-a"))?.id,
            serverPick.id
        )
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 1)
    }

    func testScopedAuthorityDrivesOfficialRowsWhileConflictDraftStaysEditable() async throws {
        let refreshedAuthority = makePick(
            id: "refreshed-authority",
            scoreBreakdown: ScoreBreakdown(
                tenthPlaceScore: 25,
                winnerBonus: 5,
                dnfBonus: 3,
                totalScore: 33
            )
        )
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: refreshedAuthority))]]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let record = try saveRecord(in: store, owner: .user("user-a"))
        XCTAssertTrue(store.transition(
            id: record.id,
            revision: record.revision,
            to: .conflict(.accountPickFound)
        ))
        XCTAssertTrue(store.preserveAuthoritative(serverPick, for: .user("user-a")))

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .conflict)
        XCTAssertEqual(viewModel.serverPick?.id, refreshedAuthority.id)
        XCTAssertEqual(viewModel.officialWinner?.id, refreshedAuthority.winnerDriverId)
        XCTAssertEqual(viewModel.officialP10?.id, refreshedAuthority.tenthPlaceDriverId)
        XCTAssertEqual(viewModel.officialDNF?.id, refreshedAuthority.dnfDriverId)
        XCTAssertEqual(viewModel.serverPick?.scoreBreakdown?.totalScore, 33)
        XCTAssertEqual(viewModel.selectedWinner?.id, selection.winnerDriverID)
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 1)

        await viewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-b",
            localPickStore: store,
            force: true
        )
        XCTAssertNil(viewModel.serverPick)
        XCTAssertNil(viewModel.officialWinner)
    }

    func testExplicitAccountSaveWithoutMigrationWorkerSupersedesQueuedGuestDraft() async throws {
        let acceptedPick = makePick(
            id: "accepted-guest-draft",
            winner: alternateSelection.winnerDriverID,
            p10: alternateSelection.tenthPlaceDriverID,
            dnf: alternateSelection.dnfDriverID
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.failure(.notFound)],
                "POST /api/picks": [.json(PickResponse(pick: acceptedPick))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let guestRecord = try saveRecord(
            in: store,
            owner: .guest,
            selection: alternateSelection
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertAlternateSelection(on: viewModel)

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(store.record(id: guestRecord.id))
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.selection,
            alternateSelection
        )
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.syncState,
            .confirmed
        )
        assertAlternateSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testExplicitDirtyAccountSaveAlsoSupersedesHiddenDirtyGuestDraft() async throws {
        let acceptedPick = makePick(id: "accepted-account-draft")
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.failure(.notFound)],
                "POST /api/picks": [.json(PickResponse(pick: acceptedPick))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let accountRecord = try saveRecord(
            in: store,
            owner: .user("user-a")
        )
        let guestRecord = try saveRecord(
            in: store,
            owner: .guest,
            selection: alternateSelection
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertDeviceSelection(on: viewModel)

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(store.record(id: guestRecord.id))
        XCTAssertEqual(store.record(id: accountRecord.id)?.selection, selection)
        XCTAssertEqual(store.record(id: accountRecord.id)?.syncState, .confirmed)
        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
    }

    func testExplicitSaveSettlesGuestServerWinsConflictIntoCurrentAccount() async throws {
        let acceptedPick = makePick(
            id: "accepted-device-review",
            winner: selection.winnerDriverID,
            p10: selection.tenthPlaceDriverID,
            dnf: selection.dnfDriverID
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [.json(PickResponse(pick: serverPick))],
                "POST /api/picks": [.json(PickResponse(pick: acceptedPick))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let guestRecord = try saveRecord(in: store, owner: .guest)
        XCTAssertTrue(
            store.transition(
                id: guestRecord.id,
                revision: guestRecord.revision,
                to: .conflict(.serverWins)
            )
        )

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .conflict)

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        viewModel.reconcileLocalState(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(store.record(id: guestRecord.id))
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.selection,
            selection
        )
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.syncState,
            .confirmed
        )
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
        XCTAssertNil(viewModel.submissionErrorMessage)
    }

    func testFailedExplicitGuestConflictReviewKeepsGuestAndDoesNotPublishAccountDraft() async throws {
        let persistence = MemoryPickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let guestRecord = try saveRecord(in: store, owner: .guest)
        XCTAssertTrue(
            store.transition(
                id: guestRecord.id,
                revision: guestRecord.revision,
                to: .conflict(.serverWins)
            )
        )
        let api = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]]
        )
        let viewModel = makeViewModel(api: api)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        persistence.rejectsWrites = true

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: guestRecord.id)?.syncState, .conflict(.serverWins))
        XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))
        XCTAssertEqual(viewModel.submissionState, .conflict)
        XCTAssertNotNil(viewModel.submissionErrorMessage)
        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 0)
    }

    func testLegacyConflictRequiresReviewAndCopiesWithoutAutomaticUpload() async throws {
        let persistence = MemoryPickPersistence()
        let legacy = LegacyLocalPickV1(
            raceId: raceID,
            winnerId: selection.winnerDriverID,
            p10Id: selection.tenthPlaceDriverID,
            dnfId: selection.dnfDriverID,
            savedAt: RaceFixtures.now,
            synced: false
        )
        persistence.setData(
            try JSONEncoder().encode([raceID: legacy]),
            forKey: "localPicks_v1"
        )
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertTrue(viewModel.hasRecoverableDevicePick)
        XCTAssertNil(viewModel.selectedWinnerID)

        viewModel.reviewLegacyDevicePick(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertFalse(viewModel.hasRecoverableDevicePick)
        assertDeviceSelection(on: viewModel)
        XCTAssertEqual(viewModel.submissionState, .reviewRequired)
        XCTAssertEqual(
            store.record(for: raceID, owner: .user("user-a"))?.syncState,
            .reviewRequired
        )
        XCTAssertNil(store.legacyConflict(for: raceID))
        XCTAssertTrue(store.queuedRecords(currentUserID: "user-a").isEmpty)
        let requests = await api.recordedRequests()
        XCTAssertFalse(requests.contains { $0.method == "POST" })
    }

    func testAuthenticatedExplicit423MarksCurrentRevisionExpired() async {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.failure(.serverError(423, "locked"))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        await viewModel.submit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let id = LocalPickRecordID(owner: .user("user-a"), raceID: raceID)
        XCTAssertEqual(store.record(id: id)?.syncState, .expired)
        XCTAssertEqual(viewModel.submissionState, .expired)
    }

    func testUnauthorizedExplicitSaveStaysQueuedAndVisibleOnDevice() async {
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.failure(.unauthorized)]]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        var rejectedTokens: [String] = []
        syncManager.setUnauthorizedHandler { rejectedTokens.append($0) }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "expired-token",
            localPickStore: store
        )
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: "expired-token",
            userID: "user-a",
            store: store
        )

        await viewModel.submit(
            token: "expired-token",
            userID: "user-a",
            localPickStore: store
        )

        let id = LocalPickRecordID(owner: .user("user-a"), raceID: raceID)
        XCTAssertEqual(store.record(id: id)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertEqual(rejectedTokens, ["expired-token"])
    }

    func testGuestSaveIsLocalOnlyAndNeverCallsPrivateAPI() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await loadAndSelectCompleteDraft(
            on: viewModel,
            token: nil,
            userID: nil,
            store: store
        )

        await viewModel.submit(
            token: nil,
            userID: nil,
            localPickStore: store
        )

        let id = LocalPickRecordID(owner: .guest, raceID: raceID)
        let record = try XCTUnwrap(store.record(id: id))
        let requests = await api.recordedRequests()
        XCTAssertEqual(record.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertTrue(requests.isEmpty)
    }

    func testHydratedGuestDraftDoesNotMasqueradeAsAnOfflineAccountSync() async {
        let store = makeStore()
        guard case .saved = store.save(
            selection: selection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a queued guest draft")
        }
        let viewModel = makeViewModel(api: GatedAPIClientSpy(responses: [:]))

        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertNil(viewModel.syncIssue)
    }

    func testSelectAndCommitKeepsIncompleteSelectionOutOfPersistence() async {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )

        let outcome = viewModel.selectAndCommit(
            driver: DriverFixtures.norris,
            for: .winner,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertEqual(outcome, .incomplete)
        XCTAssertEqual(viewModel.selectedWinnerID, DriverFixtures.norris.id)
        XCTAssertNil(store.record(for: raceID, owner: .guest))
        XCTAssertEqual(viewModel.submissionState, .idle)
    }

    func testThirdSelectionReturnsOnlyAfterExactRevisionIsReadable() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.norris,
                for: .winner,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .incomplete
        )
        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.piastri,
                for: .p10,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .incomplete
        )
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

        let record = try XCTUnwrap(store.record(id: ticket.recordID))
        XCTAssertEqual(record.revision, ticket.revision)
        XCTAssertEqual(record.selection, ticket.selection)
        XCTAssertEqual(ticket.selection, selection)
        XCTAssertEqual(ticket.userID, "user-a")
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 0)
    }

    func testCompletingAnEditedDraftCreatesANewerCommittedRevision() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let first = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        guard case .rejected = viewModel.selectAndCommit(
            driver: DriverFixtures.piastri,
            for: .winner,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        ) else { return XCTFail("The temporary duplicate should be rejected") }
        guard case .rejected = viewModel.selectAndCommit(
            driver: DriverFixtures.leclerc,
            for: .p10,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        ) else { return XCTFail("The temporary duplicate should be rejected") }
        let outcome = viewModel.selectAndCommit(
            driver: DriverFixtures.norris,
            for: .dnf,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        guard case .committed(let second) = outcome else {
            return XCTFail("Expected the edited pick to commit")
        }

        XCTAssertGreaterThan(second.revision, first.revision)
        XCTAssertEqual(second.selection, alternateSelection)
        XCTAssertEqual(store.record(id: second.recordID)?.revision, second.revision)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
    }

    func testSelectAndCommitRejectsPersistenceFailureWithoutPublishingSuccess() async {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = LocalPickStore(
            persistence: RejectingPickPersistence(),
            clock: TestClock.fixed
        )
        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )
        _ = viewModel.selectAndCommit(
            driver: DriverFixtures.norris,
            for: .winner,
            token: nil,
            userID: nil,
            localPickStore: store
        )
        _ = viewModel.selectAndCommit(
            driver: DriverFixtures.piastri,
            for: .p10,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        let outcome = viewModel.selectAndCommit(
            driver: DriverFixtures.leclerc,
            for: .dnf,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        guard case .rejected(let message) = outcome else {
            return XCTFail("Expected local persistence to reject the commit")
        }
        XCTAssertFalse(message.isEmpty)
        XCTAssertNil(store.record(for: raceID, owner: .guest))
        XCTAssertEqual(viewModel.submissionState, .idle)
        XCTAssertNotNil(viewModel.submissionErrorMessage)
    }

    func testRetryCurrentSelectionPersistsTheExactFailedWinnerDraft() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.failure(.serverError(503, "offline"))],
            ]
        )
        let persistence = MemoryPickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.piastri,
                for: .p10,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .incomplete
        )
        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.leclerc,
                for: .dnf,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .incomplete
        )

        persistence.rejectsWrites = true
        guard case .rejected = viewModel.selectAndCommit(
            driver: DriverFixtures.norris,
            for: .winner,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        ) else {
            return XCTFail("Expected the winner-slot local write to fail")
        }
        XCTAssertTrue(viewModel.didLocalWriteFail)
        XCTAssertEqual(viewModel.selectedWinnerID, DriverFixtures.norris.id)
        XCTAssertEqual(viewModel.selectedP10ID, DriverFixtures.piastri.id)
        XCTAssertEqual(viewModel.selectedDNFID, DriverFixtures.leclerc.id)
        XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))
        let postsBeforeRetry = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postsBeforeRetry, 0)

        persistence.rejectsWrites = false
        let outcome = viewModel.retryCurrentSelectionCommit(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        guard case .committed(let ticket) = outcome else {
            return XCTFail("Expected the same complete draft to persist")
        }

        XCTAssertEqual(ticket.selection, selection)
        XCTAssertEqual(viewModel.selectedWinnerID, DriverFixtures.norris.id)
        XCTAssertEqual(viewModel.selectedP10ID, DriverFixtures.piastri.id)
        XCTAssertEqual(viewModel.selectedDNFID, DriverFixtures.leclerc.id)
        XCTAssertFalse(viewModel.didLocalWriteFail)
        XCTAssertEqual(store.record(id: ticket.recordID)?.revision, ticket.revision)
        XCTAssertEqual(store.record(id: ticket.recordID)?.selection, selection)
        let postsBeforeSync = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postsBeforeSync, 0)

        await viewModel.syncCommittedPick(
            ticket,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let postsAfterSync = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postsAfterSync, 1)
    }

    func testImmediateCancellationAfterCommitKeepsReadableQueuedRevision() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        let sync = Task {
            await viewModel.syncCommittedPick(
                ticket,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        sync.cancel()
        await sync.value
        viewModel.cancelLoad()

        XCTAssertEqual(store.record(id: ticket.recordID)?.revision, ticket.revision)
        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 0)
    }

    func testSecondPostCompletesBeforeFirstWithoutApplyingTheOlderAcknowledgement() async throws {
        let oldPick = makePick(id: "old-ack")
        let newestPick = makePick(
            id: "new-ack",
            winner: alternateSelection.winnerDriverID,
            p10: alternateSelection.tenthPlaceDriverID,
            dnf: alternateSelection.dnfDriverID
        )
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [
                    .json(PickResponse(pick: oldPick)),
                    .json(PickResponse(pick: newestPick)),
                ],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let firstTicket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )
        let firstSync = Task {
            await viewModel.syncCommittedPick(
                firstTicket,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let firstRequest = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        _ = viewModel.selectAndCommit(
            driver: DriverFixtures.piastri,
            for: .winner,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        _ = viewModel.selectAndCommit(
            driver: DriverFixtures.leclerc,
            for: .p10,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let secondOutcome = viewModel.selectAndCommit(
            driver: DriverFixtures.norris,
            for: .dnf,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        guard case .committed(let secondTicket) = secondOutcome else {
            return XCTFail("Expected the newer revision")
        }
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let secondSync = Task {
            await viewModel.syncCommittedPick(
                secondTicket,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let secondRequest = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 2
        )
        let overlappingPostCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(overlappingPostCalls, 2)

        await api.releaseRequest(id: secondRequest)
        await secondSync.value

        XCTAssertGreaterThan(secondTicket.revision, firstTicket.revision)
        XCTAssertEqual(store.record(id: secondTicket.recordID)?.revision, secondTicket.revision)
        XCTAssertEqual(store.record(id: secondTicket.recordID)?.selection, alternateSelection)
        XCTAssertEqual(store.record(id: secondTicket.recordID)?.syncState, .confirmed)
        XCTAssertEqual(
            store.authoritativePick(
                for: raceID,
                owner: .user("user-a")
            )?.id,
            newestPick.id
        )
        XCTAssertEqual(viewModel.serverPick?.id, newestPick.id)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)

        await api.releaseRequest(id: firstRequest)
        await firstSync.value

        XCTAssertEqual(store.record(id: secondTicket.recordID)?.revision, secondTicket.revision)
        XCTAssertEqual(store.record(id: secondTicket.recordID)?.selection, alternateSelection)
        XCTAssertEqual(store.record(id: secondTicket.recordID)?.syncState, .confirmed)
        XCTAssertEqual(
            store.authoritativePick(
                for: raceID,
                owner: .user("user-a")
            )?.id,
            newestPick.id
        )
        XCTAssertEqual(viewModel.serverPick?.id, newestPick.id)
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)

        let lifecycle = await api.recordedEvents(
            requestIDs: [firstRequest, secondRequest]
        )
        XCTAssertEqual(
            lifecycle,
            [
                .started(firstRequest),
                .started(secondRequest),
                .released(secondRequest),
                .completed(secondRequest),
                .released(firstRequest),
                .completed(firstRequest),
            ]
        )
    }

    func testScopeChangeBeforeCommitRejectsWithoutCrossAccountPersistence() async {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        viewModel.select(driver: DriverFixtures.norris, for: .winner)
        viewModel.select(driver: DriverFixtures.piastri, for: .p10)

        let outcome = viewModel.selectAndCommit(
            driver: DriverFixtures.leclerc,
            for: .dnf,
            token: "token-b",
            userID: "user-b",
            localPickStore: store
        )

        guard case .rejected = outcome else {
            return XCTFail("Expected the captured account scope to be rejected")
        }
        XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))
        XCTAssertNil(store.record(for: raceID, owner: .user("user-b")))
        XCTAssertEqual(viewModel.privatePickAuthority, .notRequired)
    }

    func testTokenChangeBeforeSyncLeavesCommittedRevisionQueued() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: store
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        let postCalls = await api.calls(method: "POST", to: pickPath)
        XCTAssertEqual(postCalls, 0)
    }

    func testTokenChangeDuringSyncRejectsTheOldAcknowledgement() async throws {
        let responsePick = makePick(id: "stale-token-ack")
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: responsePick))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )
        let sync = Task {
            await viewModel.syncCommittedPick(
                ticket,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let request = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: store
        )
        await api.releaseRequest(id: request)
        await sync.value

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertNil(viewModel.serverPick)
    }

    func testAccountChangeDuringSyncCannotApplyTheOldAcknowledgement() async throws {
        let responsePick = makePick(id: "stale-account-ack")
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: responsePick))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )
        let sync = Task {
            await viewModel.syncCommittedPick(
                ticket,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let request = await api.waitForRequest(
            method: "POST",
            to: pickPath,
            ordinal: 1
        )

        _ = syncManager.beginSession(
            currentUserID: "user-b",
            token: "token-b",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-b",
            localPickStore: store
        )
        await api.releaseRequest(id: request)
        await sync.value

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertNil(store.record(for: raceID, owner: .user("user-b")))
        XCTAssertNil(viewModel.serverPick)
        XCTAssertNil(viewModel.selectedWinner)
        XCTAssertNil(viewModel.selectedP10)
        XCTAssertNil(viewModel.selectedDNF)
    }

    func testGuestCommittedTicketIsLocalOnly() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: nil,
            userID: nil,
            store: store
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertNil(ticket.userID)
        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testDeletedGuestTicketRehydratesInsteadOfPublishingStaleSuccess() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: nil,
            userID: nil,
            store: store
        )
        XCTAssertTrue(store.remove(raceId: raceID))

        await viewModel.syncCommittedPick(
            ticket,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertNil(store.record(id: ticket.recordID))
        XCTAssertEqual(viewModel.submissionState, .idle)
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testSupersededGuestTicketRehydratesTheCurrentRevision() async throws {
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: nil,
            userID: nil,
            store: store
        )
        guard case .saved = store.save(
            selection: alternateSelection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: TestClock.fixed.now()
        ) else {
            return XCTFail("Expected an intermediate superseding revision")
        }
        let current: LocalPickRecord
        switch store.save(
            selection: ticket.selection,
            race: RaceFixtures.upcoming,
            owner: .guest,
            now: TestClock.fixed.now()
        ) {
        case .saved(let record):
            current = record
        default:
            return XCTFail("Expected the current selection at a newer revision")
        }
        XCTAssertGreaterThan(current.revision, ticket.revision)
        XCTAssertTrue(
            store.transition(
                id: current.id,
                revision: current.revision,
                to: .expired
            )
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: current.id)?.revision, current.revision)
        XCTAssertEqual(store.record(id: current.id)?.selection, ticket.selection)
        XCTAssertEqual(viewModel.submissionState, .expired)
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testOfflineCommittedTicketStaysQueuedAndVisible() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.failure(.networkFailed(OfflineError()))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertNotNil(viewModel.submissionErrorMessage)
    }

    func testUnauthorizedCommittedTicketStaysQueuedAndReportsCapturedToken() async throws {
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.failure(.unauthorized)]]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        var rejectedTokens: [String] = []
        syncManager.setUnauthorizedHandler { rejectedTokens.append($0) }
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "expired-token",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "expired-token",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "expired-token",
            userID: "user-a",
            store: store
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: "expired-token",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .queued)
        XCTAssertEqual(viewModel.submissionState, .savedOnDevice)
        XCTAssertEqual(rejectedTokens, ["expired-token"])
    }

    func testLockedCommittedTicketRetainsExpiredLocalRevision() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.failure(.serverError(423, "locked"))],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let ticket = try commitInitialSelection(
            on: viewModel,
            token: "token-a",
            userID: "user-a",
            store: store
        )

        await viewModel.syncCommittedPick(
            ticket,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: ticket.recordID)?.syncState, .expired)
        XCTAssertEqual(store.record(id: ticket.recordID)?.revision, ticket.revision)
        XCTAssertEqual(viewModel.submissionState, .expired)
    }

    func testPrivatePickAuthorityTracksEveryLookupOutcomeAndCapturedScope() async {
        let guestViewModel = makeViewModel(api: GatedAPIClientSpy(responses: [:]))
        await guestViewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: makeStore()
        )
        XCTAssertEqual(guestViewModel.privatePickAuthority, .notRequired)

        let foundAPI = GatedAPIClientSpy(
            responses: [pickKey: [.json(PickResponse(pick: serverPick))]],
            gatedKeys: [pickKey]
        )
        let foundViewModel = makeViewModel(api: foundAPI)
        let foundLoad = Task {
            await foundViewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: makeStore()
            )
        }
        let foundRequest = await foundAPI.waitForRequest(
            method: "GET",
            to: pickPath,
            ordinal: 1
        )
        XCTAssertEqual(foundViewModel.privatePickAuthority, .checking)
        await foundAPI.releaseRequest(id: foundRequest)
        await foundLoad.value
        XCTAssertEqual(foundViewModel.privatePickAuthority, .found)

        let missingViewModel = makeViewModel(
            api: GatedAPIClientSpy(responses: [pickKey: [.failure(.notFound)]])
        )
        await missingViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: makeStore()
        )
        XCTAssertEqual(missingViewModel.privatePickAuthority, .missing)

        let unavailableViewModel = makeViewModel(
            api: GatedAPIClientSpy(
                responses: [pickKey: [.failure(.serverError(503, "offline"))]]
            )
        )
        await unavailableViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: makeStore()
        )
        XCTAssertEqual(unavailableViewModel.privatePickAuthority, .unavailable)

        let unauthorizedManager = SyncManager(
            api: GatedAPIClientSpy(responses: [:]),
            clock: TestClock.fixed
        )
        let unauthorizedAPI = GatedAPIClientSpy(
            responses: [pickKey: [.failure(.unauthorized)]]
        )
        let unauthorizedViewModel = makeViewModel(
            api: unauthorizedAPI,
            syncManager: unauthorizedManager
        )
        await unauthorizedViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: makeStore()
        )
        XCTAssertEqual(unauthorizedViewModel.privatePickAuthority, .unauthorized)
    }

    func testOldPrivateLookupCannotRestoreAuthorityAfterAccountChange() async {
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: serverPick)),
                    .failure(.notFound),
                ],
            ],
            gatedKeys: [pickKey]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
        let firstLoad = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let firstRequest = await api.waitForRequest(
            method: "GET",
            to: pickPath,
            ordinal: 1
        )
        let replacementLoad = Task {
            await viewModel.loadIfNeeded(
                token: "token-b",
                userID: "user-b",
                localPickStore: store
            )
        }
        let replacementRequest = await api.waitForRequest(
            method: "GET",
            to: pickPath,
            ordinal: 2
        )

        await api.releaseRequest(id: replacementRequest)
        await replacementLoad.value
        XCTAssertEqual(viewModel.privatePickAuthority, .missing)
        await api.releaseRequest(id: firstRequest)
        await firstLoad.value

        XCTAssertEqual(viewModel.privatePickAuthority, .missing)
        XCTAssertNil(viewModel.serverPick)
    }

    func testTokenRotationStartsANewPrivateAuthorityLookupForTheSameUser() async {
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .failure(.notFound),
                    .failure(.notFound),
                ],
            ]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.privatePickAuthority, .missing)

        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: store
        )
        await viewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-a",
            localPickStore: store
        )

        let calls = await api.calls(method: "GET", to: pickPath)
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(viewModel.privatePickAuthority, .missing)
        XCTAssertNil(viewModel.serverPick)
    }

    func testSameTokenSessionRotationRestartsInFlightPrivateAuthorityLookup() async {
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: serverPick)),
                    .failure(.notFound),
                ],
            ],
            gatedKeys: [pickKey]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        let store = makeStore()
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        let firstLoad = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        let firstRequest = await api.waitForRequest(
            method: "GET",
            to: pickPath,
            ordinal: 1
        )

        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let replacementLoad = Task {
            await viewModel.loadIfNeeded(
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            )
        }
        for _ in 0..<20 {
            await Task.yield()
        }

        let calls = await api.calls(method: "GET", to: pickPath)
        if calls == 2 {
            let replacementRequest = await api.waitForRequest(
                method: "GET",
                to: pickPath,
                ordinal: 2
            )
            await api.releaseRequest(id: replacementRequest)
        }
        await api.releaseRequest(id: firstRequest)
        await firstLoad.value
        await replacementLoad.value

        XCTAssertEqual(calls, 2)
        XCTAssertEqual(viewModel.privatePickAuthority, .missing)
        XCTAssertNil(viewModel.serverPick)
    }

    func testLegacyRecoveryRevalidatesMissingAuthorityAtTapTime() async throws {
        let persistence = MemoryPickPersistence()
        let legacy = LegacyLocalPickV1(
            raceId: raceID,
            winnerId: selection.winnerDriverID,
            p10Id: selection.tenthPlaceDriverID,
            dnfId: selection.dnfDriverID,
            savedAt: RaceFixtures.now,
            synced: false
        )
        persistence.setData(
            try JSONEncoder().encode([raceID: legacy]),
            forKey: "localPicks_v1"
        )
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .failure(.notFound),
                    .failure(.notFound),
                ],
            ]
        )
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        syncManager.setUnauthorizedHandler { _ in }
        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.privatePickAuthority, .missing)

        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: store
        )
        viewModel.reviewLegacyDevicePick(
            token: "token-b",
            userID: "user-a",
            localPickStore: store
        )

        guard store.legacyConflict(for: raceID) != nil else {
            return XCTFail("Stale missing authority must not recover the legacy pick")
        }
        XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))

        await viewModel.loadIfNeeded(
            token: "token-b",
            userID: "user-a",
            localPickStore: store
        )
        viewModel.reviewLegacyDevicePick(
            token: "token-b",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertNil(store.legacyConflict(for: raceID))
        XCTAssertNotNil(store.record(for: raceID, owner: .user("user-a")))
    }

    func testSignedInLegacyRecoveryWaitsForResolvedMissingAuthority() async throws {
        let unresolvedResponses: [GatedAPIClientSpy.Stub] = [
            .json(PickResponse(pick: serverPick)),
            .failure(.serverError(503, "unavailable")),
            .failure(.unauthorized),
        ]
        for (index, response) in unresolvedResponses.enumerated() {
            let persistence = MemoryPickPersistence()
            let legacy = LegacyLocalPickV1(
                raceId: raceID,
                winnerId: selection.winnerDriverID,
                p10Id: selection.tenthPlaceDriverID,
                dnfId: selection.dnfDriverID,
                savedAt: RaceFixtures.now,
                synced: false
            )
            persistence.setData(
                try JSONEncoder().encode([raceID: legacy]),
                forKey: "localPicks_v1"
            )
            let store = LocalPickStore(
                persistence: persistence,
                clock: TestClock.fixed
            )
            let api = GatedAPIClientSpy(responses: [pickKey: [response]])
            let viewModel = makeViewModel(api: api)

            await viewModel.loadIfNeeded(
                token: "token-\(index)",
                userID: "user-a",
                localPickStore: store
            )
            viewModel.reviewLegacyDevicePick(
                token: "token-\(index)",
                userID: "user-a",
                localPickStore: store
            )

            XCTAssertNotNil(store.legacyConflict(for: raceID))
            XCTAssertNil(store.record(for: raceID, owner: .user("user-a")))
        }
    }

    func testPickBonusAuthorityUsesStrictServerCutoffAndLockedSnapshot() async throws {
        let qualifyingStart = try XCTUnwrap(RaceFixtures.upcoming.qualifyingStartUtc)
        let before = makePick(
            id: "before",
            updatedAt: qualifyingStart.addingTimeInterval(-0.001)
        )
        let equal = makePick(id: "equal", updatedAt: qualifyingStart)
        let falseSnapshot = makePick(
            id: "false-snapshot",
            updatedAt: qualifyingStart.addingTimeInterval(-1),
            lockedSubmittedBeforeQualifying: false
        )
        let secured = makePick(
            id: "secured",
            updatedAt: qualifyingStart,
            lockedSubmittedBeforeQualifying: true
        )
        let api = GatedAPIClientSpy(
            responses: [
                pickKey: [
                    .json(PickResponse(pick: before)),
                    .json(PickResponse(pick: equal)),
                    .json(PickResponse(pick: falseSnapshot)),
                    .json(PickResponse(pick: secured)),
                ],
            ]
        )
        let viewModel = makeViewModel(api: api)
        let store = makeStore()

        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.pickBonusAuthority, .eligible)
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.pickBonusAuthority, .notEligible)
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.pickBonusAuthority, .eligible)
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        XCTAssertEqual(viewModel.pickBonusAuthority, .secured)
    }

    func testLegacyPickPayloadDecodesMissingAuthorityFieldsAsNil() throws {
        let data = try XCTUnwrap(
            """
            {
              "id": "legacy",
              "raceId": "race",
              "tenthPlaceDriverId": "piastri",
              "winnerDriverId": "norris",
              "dnfDriverId": "leclerc",
              "lockedAt": null,
              "scoreBreakdown": null
            }
            """.data(using: .utf8)
        )

        let pick = try JSONDecoder.api().decode(Pick.self, from: data)

        XCTAssertNil(pick.updatedAt)
        XCTAssertNil(pick.lockedSubmittedBeforeQualifying)
    }

    private var raceID: String { RaceFixtures.upcoming.id }
    private var detailPath: String { "/api/races/\(raceID)" }
    private var pickPath: String { "/api/picks" }
    private var detailKey: String { "GET \(detailPath)" }
    private var pickKey: String { "GET \(pickPath)" }
    private var drivers: [Driver] {
        [DriverFixtures.norris, DriverFixtures.piastri, DriverFixtures.leclerc]
    }
    private var refreshedDrivers: [Driver] {
        [
            refreshed(DriverFixtures.norris, code: "NOR-REFRESHED"),
            refreshed(DriverFixtures.piastri, code: "PIA-REFRESHED"),
            refreshed(DriverFixtures.leclerc, code: "LEC-REFRESHED"),
        ]
    }
    private var selection: PickSelection {
        PickSelection(
            winnerDriverID: DriverFixtures.norris.id,
            tenthPlaceDriverID: DriverFixtures.piastri.id,
            dnfDriverID: DriverFixtures.leclerc.id
        )
    }
    private var alternateSelection: PickSelection {
        PickSelection(
            winnerDriverID: DriverFixtures.piastri.id,
            tenthPlaceDriverID: DriverFixtures.leclerc.id,
            dnfDriverID: DriverFixtures.norris.id
        )
    }
    private var serverPick: Pick {
        makePick(
            id: "server",
            winner: DriverFixtures.leclerc.id,
            p10: DriverFixtures.norris.id,
            dnf: DriverFixtures.piastri.id
        )
    }

    private func makeViewModel(
        api: GatedAPIClientSpy,
        repository: (any RaceRepositoryProtocol)? = nil,
        syncManager: SyncManager? = nil
    ) -> RaceDetailViewModel {
        let repository = repository ?? ImmediateRaceRepository(
            detail: makeDetail(savedAt: RaceFixtures.now, entrants: drivers)
        )
        return RaceDetailViewModel(
            summary: RaceFixtures.upcoming,
            repository: repository,
            api: api,
            syncManager: syncManager ?? SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
    }

    private func makeStore() -> LocalPickStore {
        LocalPickStore(
            persistence: MemoryPickPersistence(),
            clock: TestClock.fixed
        )
    }

    private func makeDetail(
        savedAt: Date,
        entrants: [Driver]
    ) -> RaceDetailSnapshot {
        RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: savedAt,
            race: RaceFixtures.upcoming,
            entrants: entrants,
            results: [],
            qualifyingResults: []
        )
    }

    private func makePayload(
        entrants: [Driver]? = nil
    ) -> RaceDetailPayload {
        RaceDetailPayload(
            race: RaceFixtures.upcoming,
            entrants: entrants ?? drivers,
            results: [],
            qualifyingResults: []
        )
    }

    private func makePick(
        id: String,
        winner: String = "norris",
        p10: String = "piastri",
        dnf: String = "leclerc",
        lockedAt: Date? = nil,
        scoreBreakdown: ScoreBreakdown? = nil,
        updatedAt: Date? = nil,
        lockedSubmittedBeforeQualifying: Bool? = nil
    ) -> Pick {
        Pick(
            id: id,
            raceId: raceID,
            tenthPlaceDriverId: p10,
            winnerDriverId: winner,
            dnfDriverId: dnf,
            lockedAt: lockedAt,
            scoreBreakdown: scoreBreakdown,
            updatedAt: updatedAt,
            lockedSubmittedBeforeQualifying: lockedSubmittedBeforeQualifying
        )
    }

    private func refreshed(_ driver: Driver, code: String) -> Driver {
        Driver(
            id: driver.id,
            code: code,
            firstName: driver.firstName,
            lastName: driver.lastName,
            number: driver.number,
            photoUrl: driver.photoUrl,
            seatKey: driver.seatKey,
            constructor: driver.constructor
        )
    }

    private func saveRecord(
        in store: LocalPickStore,
        owner: PickOwnerScope,
        selection: PickSelection? = nil
    ) throws -> LocalPickRecord {
        switch store.save(
            selection: selection ?? self.selection,
            race: RaceFixtures.upcoming,
            owner: owner,
            now: RaceFixtures.now
        ) {
        case .saved(let record):
            return record
        default:
            throw RaceDetailViewModelTestError.expectedSavedRecord
        }
    }

    private func selectCompleteDraft(on viewModel: RaceDetailViewModel) {
        viewModel.select(driver: DriverFixtures.norris, for: .winner)
        viewModel.select(driver: DriverFixtures.piastri, for: .p10)
        viewModel.select(driver: DriverFixtures.leclerc, for: .dnf)
    }

    private func commitInitialSelection(
        on viewModel: RaceDetailViewModel,
        token: String?,
        userID: String?,
        store: LocalPickStore
    ) throws -> PickCommitTicket {
        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.norris,
                for: .winner,
                token: token,
                userID: userID,
                localPickStore: store
            ),
            .incomplete
        )
        XCTAssertEqual(
            viewModel.selectAndCommit(
                driver: DriverFixtures.piastri,
                for: .p10,
                token: token,
                userID: userID,
                localPickStore: store
            ),
            .incomplete
        )
        guard case .committed(let ticket) = viewModel.selectAndCommit(
            driver: DriverFixtures.leclerc,
            for: .dnf,
            token: token,
            userID: userID,
            localPickStore: store
        ) else {
            throw RaceDetailViewModelTestError.expectedCommittedTicket
        }
        return ticket
    }

    private func loadAndSelectCompleteDraft(
        on viewModel: RaceDetailViewModel,
        token: String?,
        userID: String?,
        store: LocalPickStore
    ) async {
        await viewModel.loadIfNeeded(
            token: token,
            userID: userID,
            localPickStore: store
        )
        selectCompleteDraft(on: viewModel)
    }

    private func assertDeviceSelection(
        on viewModel: RaceDetailViewModel,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(
            viewModel.selectedWinner?.id,
            DriverFixtures.norris.id,
            file: file,
            line: line
        )
        XCTAssertEqual(
            viewModel.selectedP10?.id,
            DriverFixtures.piastri.id,
            file: file,
            line: line
        )
        XCTAssertEqual(
            viewModel.selectedDNF?.id,
            DriverFixtures.leclerc.id,
            file: file,
            line: line
        )
    }

    private func assertAlternateSelection(
        on viewModel: RaceDetailViewModel,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(
            viewModel.selectedWinner?.id,
            DriverFixtures.piastri.id,
            file: file,
            line: line
        )
        XCTAssertEqual(
            viewModel.selectedP10?.id,
            DriverFixtures.leclerc.id,
            file: file,
            line: line
        )
        XCTAssertEqual(
            viewModel.selectedDNF?.id,
            DriverFixtures.norris.id,
            file: file,
            line: line
        )
    }
}

private actor ImmediateRaceRepository: RaceRepositoryProtocol {
    private let detail: RaceDetailSnapshot

    init(detail: RaceDetailSnapshot) {
        self.detail = detail
    }

    func cachedList() async -> RaceListSnapshot? { nil }

    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot {
        throw APIError.notFound
    }

    func cachedDetail(id: String) async -> RaceDetailSnapshot? {
        id == detail.race.id ? detail : nil
    }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        guard id == detail.race.id else { throw APIError.notFound }
        return detail
    }

    func prefetchDetail(ids: [String]) async {}
}

private actor SequencedRaceDetailRepository: RaceRepositoryProtocol {
    private struct Waiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private var refreshCount = 0
    private var pending: [Int: CheckedContinuation<RaceDetailSnapshot, Error>] = [:]
    private var waiters: [Waiter] = []

    func cachedList() async -> RaceListSnapshot? { nil }

    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot {
        throw APIError.notFound
    }

    func cachedDetail(id: String) async -> RaceDetailSnapshot? { nil }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        refreshCount += 1
        let ordinal = refreshCount
        resumeWaiters()
        return try await withCheckedThrowingContinuation { continuation in
            pending[ordinal] = continuation
        }
    }

    func prefetchDetail(ids: [String]) async {}

    func waitForRefresh(_ count: Int) async {
        guard refreshCount < count else { return }
        await withCheckedContinuation { continuation in
            waiters.append(Waiter(count: count, continuation: continuation))
        }
    }

    func succeed(_ ordinal: Int, with snapshot: RaceDetailSnapshot) {
        pending.removeValue(forKey: ordinal)?.resume(returning: snapshot)
    }

    func fail(_ ordinal: Int, with error: APIError) {
        pending.removeValue(forKey: ordinal)?.resume(throwing: error)
    }

    private func resumeWaiters() {
        var remaining: [Waiter] = []
        for waiter in waiters {
            if refreshCount >= waiter.count {
                waiter.continuation.resume()
            } else {
                remaining.append(waiter)
            }
        }
        waiters = remaining
    }
}

@MainActor
private final class MemoryPickPersistence: LocalPickPersisting {
    private var values: [String: Data] = [:]
    var rejectsWrites = false

    func data(forKey key: String) -> Data? {
        values[key]
    }

    func setData(_ data: Data, forKey key: String) {
        guard !rejectsWrites else { return }
        values[key] = data
    }

    func removeData(forKey key: String) {
        values[key] = nil
    }
}

@MainActor
private final class RejectingPickPersistence: LocalPickPersisting {
    func data(forKey key: String) -> Data? { nil }
    func setData(_ data: Data, forKey key: String) {}
    func removeData(forKey key: String) {}
}

private struct OfflineError: LocalizedError, Sendable {
    var errorDescription: String? { "offline" }
}

private enum RaceDetailViewModelTestError: Error {
    case expectedSavedRecord
    case expectedCommittedTicket
}

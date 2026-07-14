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

    func testObservedConfirmedRevisionClearsAMismatchedOlderServerPick() async {
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
        XCTAssertNil(viewModel.serverPick)
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

    func testPrivate404RehydratesTheReconciledConfirmedLocalSelection() async throws {
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
        XCTAssertEqual(viewModel.submissionState, .savedToAccount)
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
            responses: [pickKey: [.failure(.notFound)]]
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
        XCTAssertEqual(pickCalls, 0)

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
            responses: [pickKey: [.json(PickResponse(pick: migratedPick))]]
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
        XCTAssertEqual(accountBViewModel.submissionState, .savedToAccount)
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
        let pickCalls = await api.calls(to: pickPath)
        XCTAssertEqual(pickCalls, 0)
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
        let viewModel = makeViewModel(api: api)
        let store = makeStore()
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
        dnf: String = "leclerc"
    ) -> Pick {
        Pick(
            id: id,
            raceId: raceID,
            tenthPlaceDriverId: p10,
            winnerDriverId: winner,
            dnfDriverId: dnf,
            lockedAt: nil,
            scoreBreakdown: nil
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
}

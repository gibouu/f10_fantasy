import Foundation
import XCTest
@testable import FXRacing

@MainActor
final class LegacyRecoveryActionTests: XCTestCase {
    func testGuestUseAtomicallyAdoptsWithoutAccountSync() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let api = GatedAPIClientSpy(responses: [:])
        let viewModel = makeViewModel(api: api)
        await viewModel.loadIfNeeded(token: nil, userID: nil, localPickStore: store)

        let outcome = viewModel.resolveLegacyDevicePick(
            action: .use,
            expectedOwner: .guest,
            expectedLegacyRevision: legacy.revision,
            expectedDestinationRevision: nil,
            token: nil,
            userID: nil,
            localPickStore: store
        )

        guard case .committed(let ticket) = outcome else {
            return XCTFail("Guest use should return the persisted commit ticket")
        }
        XCTAssertNil(ticket.userID)
        XCTAssertNil(store.legacyConflict(for: race.id))
        XCTAssertEqual(
            store.record(for: race.id, owner: .guest)?.selection,
            legacy.selection
        )
        await viewModel.syncCommittedPick(
            ticket,
            token: nil,
            userID: nil,
            localPickStore: store
        )
        let postCalls = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(postCalls, 0)
    }

    func testSignedEmptyUseSyncsOnlyAfterPersistedReadback() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.failure(.notFound)],
                "POST /api/picks": [.json(PickResponse(pick: serverPick))],
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

        let outcome = viewModel.resolveLegacyDevicePick(
            action: .use,
            expectedOwner: .user("user-a"),
            expectedLegacyRevision: legacy.revision,
            expectedDestinationRevision: nil,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        guard case .committed(let ticket) = outcome else {
            return XCTFail("Signed use should return the persisted commit ticket")
        }
        XCTAssertEqual(ticket.userID, "user-a")
        let callsBeforeSync = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(callsBeforeSync, 0)

        await viewModel.syncCommittedPick(
            ticket,
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        let callsAfterSync = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(callsAfterSync, 1)
        XCTAssertEqual(
            store.record(for: race.id, owner: .user("user-a"))?.syncState,
            .confirmed
        )
    }

    func testUnknownOrStaleAccountAuthorityPreservesLegacySource() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let api = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.serverError(503, "offline"))]]
        )
        let viewModel = makeViewModel(api: api)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(
            viewModel.resolveLegacyDevicePick(
                action: .use,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: legacy.revision,
                expectedDestinationRevision: nil,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .rejected("Connect to check account picks, then retry.")
        )
        XCTAssertEqual(store.legacyConflict(for: race.id), legacy)
    }

    func testKeepDiscardAndReplaceUseExpectedDestinationRevision() async throws {
        let (keepStore, keepLegacy) = try makeStoreWithLegacy()
        let current = try XCTUnwrap(savedCurrent(in: keepStore))
        let keepAPI = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.notFound)] ]
        )
        let keepSyncManager = activeSyncManager(api: keepAPI, store: keepStore)
        let keepViewModel = makeViewModel(api: keepAPI, syncManager: keepSyncManager)
        await keepViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: keepStore
        )
        XCTAssertEqual(
            keepViewModel.resolveLegacyDevicePick(
                action: .keepCurrent,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: keepLegacy.revision,
                expectedDestinationRevision: current.revision,
                token: "token-a",
                userID: "user-a",
                localPickStore: keepStore
            ),
            .resolved
        )
        XCTAssertNil(keepStore.legacyConflict(for: race.id))
        XCTAssertEqual(keepStore.record(id: current.id), current)

        let (replaceStore, replaceLegacy) = try makeStoreWithLegacy()
        let replacedCurrent = try XCTUnwrap(savedCurrent(in: replaceStore))
        let replaceAPI = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.notFound)] ]
        )
        let replaceSyncManager = activeSyncManager(
            api: replaceAPI,
            store: replaceStore
        )
        let replaceViewModel = makeViewModel(
            api: replaceAPI,
            syncManager: replaceSyncManager
        )
        await replaceViewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: replaceStore
        )
        let replace = replaceViewModel.resolveLegacyDevicePick(
            action: .replace,
            expectedOwner: .user("user-a"),
            expectedLegacyRevision: replaceLegacy.revision,
            expectedDestinationRevision: replacedCurrent.revision,
            token: "token-a",
            userID: "user-a",
            localPickStore: replaceStore
        )
        guard case .committed = replace else {
            return XCTFail("Confirmed replace should commit the legacy selection")
        }
        XCTAssertEqual(
            replaceStore.record(id: replacedCurrent.id)?.selection,
            replaceLegacy.selection
        )

        let (discardStore, discardLegacy) = try makeStoreWithLegacy()
        let discardViewModel = makeViewModel(api: GatedAPIClientSpy(responses: [:]))
        await discardViewModel.loadIfNeeded(
            token: nil,
            userID: nil,
            localPickStore: discardStore
        )
        XCTAssertEqual(
            discardViewModel.resolveLegacyDevicePick(
                action: .discard,
                expectedOwner: .guest,
                expectedLegacyRevision: discardLegacy.revision,
                expectedDestinationRevision: nil,
                token: nil,
                userID: nil,
                localPickStore: discardStore
            ),
            .resolved
        )
        XCTAssertNil(discardStore.legacyConflict(for: race.id))
    }

    func testSignedDiscardRejectsRotatedTokenOrLeaseAndRetainsLegacySource() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let api = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.notFound)]]
        )
        let syncManager = activeSyncManager(api: api, store: store)
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        _ = syncManager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: store
        )

        XCTAssertEqual(
            viewModel.resolveLegacyDevicePick(
                action: .discard,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: legacy.revision,
                expectedDestinationRevision: nil,
                token: "token-b",
                userID: "user-a",
                localPickStore: store
            ),
            .rejected("Connect to check account picks, then retry.")
        )
        XCTAssertEqual(store.legacyConflict(for: race.id), legacy)
    }

    func testSignedDiscardRejectsChangedDestinationRevisionAndRetainsLegacySource() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let current = try XCTUnwrap(savedCurrent(in: store))
        let api = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.notFound)]]
        )
        let syncManager = activeSyncManager(api: api, store: store)
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        _ = store.save(
            selection: selection,
            race: race,
            owner: .user("user-a"),
            now: RaceFixtures.now.addingTimeInterval(1),
            forceNewRevision: true
        )

        XCTAssertEqual(
            viewModel.resolveLegacyDevicePick(
                action: .discard,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: legacy.revision,
                expectedDestinationRevision: current.revision,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .rejected("Your current picks changed. Close this sheet and review them again.")
        )
        XCTAssertEqual(store.legacyConflict(for: race.id), legacy)
    }

    func testSignedKeepRejectsChangedServerFingerprintAndRetainsLegacySource() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let current = try XCTUnwrap(savedCurrent(in: store))
        let original = serverPick
        let changed = Pick(
            id: original.id,
            raceId: original.raceId,
            tenthPlaceDriverId: original.tenthPlaceDriverId,
            winnerDriverId: original.winnerDriverId,
            dnfDriverId: original.dnfDriverId,
            lockedAt: original.lockedAt,
            scoreBreakdown: original.scoreBreakdown,
            updatedAt: Date(timeIntervalSince1970: 5)
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [
                    .json(PickResponse(pick: original)),
                    .json(PickResponse(pick: changed)),
                ],
            ]
        )
        let syncManager = activeSyncManager(api: api, store: store)
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let captured = LegacyPrivatePickSnapshot(
            id: original.id,
            selection: selection,
            lockedAt: original.lockedAt,
            updatedAt: original.updatedAt
        )
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(
            viewModel.resolveLegacyDevicePick(
                action: .keepCurrent,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: legacy.revision,
                expectedDestinationRevision: current.revision,
                expectedServerPick: captured,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .rejected("Your current picks changed. Close this sheet and review them again.")
        )
        XCTAssertEqual(store.legacyConflict(for: race.id), legacy)
    }

    func testSignedKeepRejectsChangedServerLockStateAndRetainsLegacySource() async throws {
        let (store, legacy) = try makeStoreWithLegacy()
        let current = try XCTUnwrap(savedCurrent(in: store))
        let original = serverPick
        let locked = Pick(
            id: original.id,
            raceId: original.raceId,
            tenthPlaceDriverId: original.tenthPlaceDriverId,
            winnerDriverId: original.winnerDriverId,
            dnfDriverId: original.dnfDriverId,
            lockedAt: RaceFixtures.now,
            scoreBreakdown: original.scoreBreakdown,
            updatedAt: original.updatedAt
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [
                    .json(PickResponse(pick: original)),
                    .json(PickResponse(pick: locked)),
                ],
            ]
        )
        let syncManager = activeSyncManager(api: api, store: store)
        let viewModel = makeViewModel(api: api, syncManager: syncManager)
        await viewModel.loadIfNeeded(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )
        let captured = LegacyPrivatePickSnapshot(
            id: original.id,
            selection: selection,
            lockedAt: original.lockedAt,
            updatedAt: original.updatedAt
        )
        await viewModel.refresh(
            token: "token-a",
            userID: "user-a",
            localPickStore: store
        )

        XCTAssertEqual(
            viewModel.resolveLegacyDevicePick(
                action: .keepCurrent,
                expectedOwner: .user("user-a"),
                expectedLegacyRevision: legacy.revision,
                expectedDestinationRevision: current.revision,
                expectedServerPick: captured,
                token: "token-a",
                userID: "user-a",
                localPickStore: store
            ),
            .rejected("Your current picks changed. Close this sheet and review them again.")
        )
        XCTAssertEqual(store.legacyConflict(for: race.id), legacy)
    }

    private var race: Race { RaceFixtures.upcoming }
    private var selection: PickSelection {
        PickSelection(
            winnerDriverID: DriverFixtures.norris.id,
            tenthPlaceDriverID: DriverFixtures.piastri.id,
            dnfDriverID: DriverFixtures.leclerc.id
        )
    }
    private var serverPick: Pick {
        Pick(
            id: "server",
            raceId: race.id,
            tenthPlaceDriverId: selection.tenthPlaceDriverID,
            winnerDriverId: selection.winnerDriverID,
            dnfDriverId: selection.dnfDriverID,
            lockedAt: nil,
            scoreBreakdown: nil
        )
    }

    private func makeStoreWithLegacy() throws -> (LocalPickStore, LocalPickRecord) {
        let persistence = LegacyRecoveryPickPersistence()
        persistence.setData(
            try JSONEncoder().encode([
                race.id: LegacyLocalPickV1(
                    raceId: race.id,
                    winnerId: selection.winnerDriverID,
                    p10Id: selection.tenthPlaceDriverID,
                    dnfId: selection.dnfDriverID,
                    savedAt: RaceFixtures.now,
                    synced: false
                ),
            ]),
            forKey: "localPicks_v1"
        )
        let store = LocalPickStore(persistence: persistence, clock: TestClock.fixed)
        return (store, try XCTUnwrap(store.legacyConflict(for: race.id)))
    }

    private func savedCurrent(in store: LocalPickStore) -> LocalPickRecord? {
        guard case .saved(let record) = store.save(
            selection: PickSelection(
                winnerDriverID: DriverFixtures.piastri.id,
                tenthPlaceDriverID: DriverFixtures.leclerc.id,
                dnfDriverID: DriverFixtures.norris.id
            ),
            race: race,
            owner: .user("user-a"),
            now: RaceFixtures.now
        ) else { return nil }
        return record
    }

    private func makeViewModel(
        api: GatedAPIClientSpy,
        syncManager: SyncManager? = nil
    ) -> RaceDetailViewModel {
        RaceDetailViewModel(
            summary: race,
            repository: RaceRepository(
                api: api,
                cache: MemoryRaceSnapshotCache(
                    details: [
                        race.id: RaceDetailSnapshot(
                            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
                            savedAt: RaceFixtures.now,
                            race: race,
                            entrants: [
                                DriverFixtures.norris,
                                DriverFixtures.piastri,
                                DriverFixtures.leclerc,
                            ],
                            results: [],
                            qualifyingResults: []
                        ),
                    ]
                ),
                clock: TestClock.fixed
            ),
            api: api,
            syncManager: syncManager ?? SyncManager(api: api, clock: TestClock.fixed),
            clock: TestClock.fixed
        )
    }

    private func activeSyncManager(
        api: GatedAPIClientSpy,
        store: LocalPickStore
    ) -> SyncManager {
        let manager = SyncManager(api: api, clock: TestClock.fixed)
        manager.setUnauthorizedHandler { _ in }
        _ = manager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )
        return manager
    }
}

@MainActor
private final class LegacyRecoveryPickPersistence: LocalPickPersisting {
    private var values: [String: Data] = [:]

    func data(forKey key: String) -> Data? { values[key] }

    func setData(_ data: Data, forKey key: String) {
        values[key] = data
    }

    func removeData(forKey key: String) {
        values[key] = nil
    }
}

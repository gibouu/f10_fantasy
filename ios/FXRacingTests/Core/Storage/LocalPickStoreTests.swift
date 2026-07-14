import Foundation
import XCTest
@testable import FXRacing

@MainActor
final class LocalPickStoreTests: XCTestCase {
    func testFailedV1AuthenticatedUploadBecomesLegacyConflict() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let legacy = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: nil
        )
        context.defaults.set(
            try JSONEncoder().encode(["spa": legacy]),
            forKey: "localPicks_v1"
        )

        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let record = try XCTUnwrap(store.legacyConflict(for: "spa"))

        XCTAssertEqual(record.id, LocalPickRecordID(owner: .legacyAmbiguous, raceID: "spa"))
        XCTAssertEqual(record.selection, selection)
        XCTAssertEqual(record.savedAt, RaceFixtures.now)
        XCTAssertEqual(record.revision, 1)
        XCTAssertEqual(record.syncState, .conflict(.legacyNeedsReview))
        XCTAssertTrue(store.queuedRecords(currentUserID: "user-b").isEmpty)
        XCTAssertNil(context.defaults.data(forKey: "localPicks_v1"))
        XCTAssertNotNil(context.defaults.data(forKey: "localPicks_v2"))
    }

    func testExpiredV1RecordStaysExpiredAndNeverQueues() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let legacy = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: .expired
        )
        context.defaults.set(
            try JSONEncoder().encode(["spa": legacy]),
            forKey: "localPicks_v1"
        )

        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let record = try XCTUnwrap(
            store.record(for: "spa", owner: .legacyAmbiguous)
        )

        XCTAssertEqual(record.syncState, .expired)
        XCTAssertNil(store.legacyConflict(for: "spa"))
        XCTAssertTrue(store.queuedRecords(currentUserID: "user-a").isEmpty)
    }

    func testSyncedV1RecordStillBecomesLegacyAmbiguousConflict() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let legacy = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: true,
            migrationStatus: nil
        )
        context.defaults.set(
            try JSONEncoder().encode(["spa": legacy]),
            forKey: "localPicks_v1"
        )

        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)

        XCTAssertEqual(
            store.record(for: "spa", owner: .legacyAmbiguous)?.syncState,
            .conflict(.legacyNeedsReview)
        )
        XCTAssertTrue(store.queuedRecords(currentUserID: "user-a").isEmpty)
    }

    func testLegacyLocalPicksKeyMigratesWhenV1KeyIsAbsent() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let legacy = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: nil
        )
        context.defaults.set(
            try JSONEncoder().encode(["spa": legacy]),
            forKey: "localPicks"
        )

        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)

        XCTAssertNotNil(store.legacyConflict(for: "spa"))
        XCTAssertNil(context.defaults.data(forKey: "localPicks"))
        XCTAssertNotNil(context.defaults.data(forKey: "localPicks_v2"))
    }

    func testLegacyMigrationAssignsRevisionsInStableRaceIDOrder() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let races = ["zandvoort", "australia", "monaco"]
        let legacy = Dictionary(uniqueKeysWithValues: races.map { raceID in
            (
                raceID,
                LegacyLocalPickV1(
                    raceId: raceID,
                    winnerId: "norris",
                    p10Id: "piastri",
                    dnfId: "leclerc",
                    savedAt: RaceFixtures.now,
                    synced: false,
                    migrationStatus: nil
                )
            )
        })
        context.defaults.set(
            try JSONEncoder().encode(legacy),
            forKey: "localPicks_v1"
        )

        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)

        XCTAssertEqual(store.legacyConflict(for: "australia")?.revision, 1)
        XCTAssertEqual(store.legacyConflict(for: "monaco")?.revision, 2)
        XCTAssertEqual(store.legacyConflict(for: "zandvoort")?.revision, 3)
    }

    func testV1KeysAreDeletedOnlyAfterV2PersistenceReadsBack() throws {
        let persistence = LocalPickPersistenceSpy(rejectsWrites: true)
        let legacy = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: nil
        )
        let data = try JSONEncoder().encode(["spa": legacy])
        persistence.seed(data, forKey: "localPicks_v1")
        persistence.seed(data, forKey: "localPicks")

        let failed = LocalPickStore(persistence: persistence, clock: TestClock.fixed)

        XCTAssertNotNil(failed.legacyConflict(for: "spa"))
        XCTAssertEqual(persistence.data(forKey: "localPicks_v1"), data)
        XCTAssertEqual(persistence.data(forKey: "localPicks"), data)
        XCTAssertNil(persistence.data(forKey: "localPicks_v2"))

        persistence.rejectsWrites = false
        let persisted = LocalPickStore(persistence: persistence, clock: TestClock.fixed)

        XCTAssertNotNil(persisted.legacyConflict(for: "spa"))
        let v2Data = try XCTUnwrap(persistence.data(forKey: "localPicks_v2"))
        let v2Object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: v2Data) as? [String: Any]
        )
        XCTAssertEqual(v2Object["schemaVersion"] as? Int, 2)
        XCTAssertEqual(v2Object["nextRevision"] as? Int, 2)
        XCTAssertEqual((v2Object["records"] as? [[String: Any]])?.count, 1)
        XCTAssertNil(persistence.data(forKey: "localPicks_v1"))
        XCTAssertNil(persistence.data(forKey: "localPicks"))

        let reloaded = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        XCTAssertNotNil(reloaded.legacyConflict(for: "spa"))
    }

    func testUnsupportedV2SchemaLeavesStoredBytesUntouched() throws {
        let persistence = LocalPickPersistenceSpy()
        let unsupported = Data(
            #"{"schemaVersion":999,"nextRevision":1,"records":[]}"#.utf8
        )
        let legacy = try JSONEncoder().encode([
            "spa": LegacyLocalPickV1(
                raceId: "spa",
                winnerId: "norris",
                p10Id: "piastri",
                dnfId: "leclerc",
                savedAt: RaceFixtures.now,
                synced: false,
                migrationStatus: nil
            ),
        ])
        persistence.seed(unsupported, forKey: "localPicks_v2")
        persistence.seed(legacy, forKey: "localPicks_v1")

        let store = LocalPickStore(persistence: persistence, clock: TestClock.fixed)

        XCTAssertEqual(persistence.data(forKey: "localPicks_v2"), unsupported)
        XCTAssertEqual(persistence.data(forKey: "localPicks_v1"), legacy)
        XCTAssertNil(store.record(for: "spa", owner: .guest))
        XCTAssertNil(store.record(for: "spa", owner: .legacyAmbiguous))
    }

    func testAccountARecordIsHiddenFromAccountBAndDormantInItsQueue() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let result = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now
        )
        guard case .saved(let saved) = result else {
            return XCTFail("Expected the account-A record to save")
        }

        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), saved)
        XCTAssertNil(store.record(for: "spa", owner: .user("b")))
        XCTAssertTrue(store.queuedRecords(currentUserID: "b").isEmpty)
        XCTAssertEqual(store.queuedRecords(currentUserID: "a").map(\.id), [saved.id])
        XCTAssertFalse(
            store.transition(
                id: LocalPickRecordID(owner: .user("b"), raceID: "spa"),
                revision: saved.revision,
                to: .confirmed
            )
        )
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), saved)
    }

    func testCompositeIDKeepsGuestUsersAndLegacyRecordsForTheSameRace() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let legacyPick = LegacyLocalPickV1(
            raceId: "spa",
            winnerId: "norris",
            p10Id: "piastri",
            dnfId: "leclerc",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: nil
        )
        context.defaults.set(
            try JSONEncoder().encode(["spa": legacyPick]),
            forKey: "localPicks_v1"
        )
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let guestSelection = selection
        let userASelection = PickSelection(
            winnerDriverID: "leclerc",
            tenthPlaceDriverID: "norris",
            dnfDriverID: "piastri"
        )
        let userBSelection = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "leclerc",
            dnfDriverID: "norris"
        )

        _ = store.save(
            selection: guestSelection,
            race: RaceFixtures.liveSpa,
            owner: .guest,
            now: RaceFixtures.now
        )
        _ = store.save(
            selection: userASelection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now
        )
        _ = store.save(
            selection: userBSelection,
            race: RaceFixtures.liveSpa,
            owner: .user("b"),
            now: RaceFixtures.now
        )

        XCTAssertEqual(store.record(for: "spa", owner: .guest)?.selection, guestSelection)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.selection, userASelection)
        XCTAssertEqual(store.record(for: "spa", owner: .user("b"))?.selection, userBSelection)
        XCTAssertEqual(
            store.record(for: "spa", owner: .legacyAmbiguous)?.selection,
            selection
        )
        XCTAssertEqual(
            store.record(for: "spa", owner: .legacyAmbiguous)?.syncState,
            .conflict(.legacyNeedsReview)
        )
    }

    func testRevisionsIncreaseStoreWideAndContinueAfterReload() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        var store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let changedSelection = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "leclerc",
            dnfDriverID: "norris"
        )

        _ = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .guest,
            now: RaceFixtures.now
        )
        _ = store.save(
            selection: selection,
            race: RaceFixtures.upcoming,
            owner: .user("a"),
            now: RaceFixtures.now
        )
        _ = store.save(
            selection: changedSelection,
            race: RaceFixtures.liveSpa,
            owner: .guest,
            now: RaceFixtures.now
        )

        XCTAssertEqual(store.record(for: "monza", owner: .user("a"))?.revision, 2)
        XCTAssertEqual(store.record(for: "spa", owner: .guest)?.revision, 3)

        store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let fourthRace = makeUnlockedRace(id: "revision-four", round: 4)
        _ = store.save(
            selection: selection,
            race: fourthRace,
            owner: .user("b"),
            now: RaceFixtures.now
        )

        XCTAssertEqual(store.record(for: fourthRace.id, owner: .user("b"))?.revision, 4)
    }

    func testUnchangedSavePreservesInflightRevisionAndDoesNotConsumeANewOne() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let initial = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now
        )
        guard case .saved(let saved) = initial else {
            return XCTFail("Expected the first save to create a record")
        }
        XCTAssertTrue(
            store.transition(
                id: saved.id,
                revision: saved.revision,
                to: .syncing(revision: saved.revision, mode: .direct)
            )
        )

        let unchanged = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now.addingTimeInterval(30)
        )
        guard case .unchanged(let joined) = unchanged else {
            return XCTFail("Expected identical selections to reuse the record")
        }

        XCTAssertEqual(joined.revision, saved.revision)
        XCTAssertEqual(joined.savedAt, saved.savedAt)
        XCTAssertEqual(
            joined.syncState,
            .syncing(revision: saved.revision, mode: .direct)
        )

        let nextRace = makeUnlockedRace(id: "after-unchanged", round: 5)
        let next = store.save(
            selection: selection,
            race: nextRace,
            owner: .guest,
            now: RaceFixtures.now
        )
        guard case .saved(let nextRecord) = next else {
            return XCTFail("Expected a different record to save")
        }
        XCTAssertEqual(nextRecord.revision, saved.revision + 1)
    }

    func testChangedSaveDuringSyncingCreatesNewQueuedRevision() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let initial = try saveRecord(
            in: store,
            race: RaceFixtures.liveSpa,
            owner: .user("a")
        )
        XCTAssertTrue(
            store.transition(
                id: initial.id,
                revision: initial.revision,
                to: .syncing(revision: initial.revision, mode: .direct)
            )
        )
        let changed = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "leclerc",
            dnfDriverID: "norris"
        )

        let result = store.save(
            selection: changed,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now.addingTimeInterval(1)
        )
        guard case .saved(let replacement) = result else {
            return XCTFail("Expected changed in-flight selections to create a revision")
        }

        XCTAssertEqual(replacement.revision, initial.revision + 1)
        XCTAssertEqual(replacement.selection, changed)
        XCTAssertEqual(replacement.syncState, .queued)
    }

    func testPersistedSyncingStateNormalizesToQueued() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        var store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let result = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now
        )
        guard case .saved(let saved) = result else {
            return XCTFail("Expected a saved record")
        }
        XCTAssertTrue(
            store.transition(
                id: saved.id,
                revision: saved.revision,
                to: .syncing(revision: saved.revision, mode: .authenticatedRetry)
            )
        )

        store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.revision, saved.revision)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.syncState, .queued)

        store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.revision, saved.revision)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a"))?.syncState, .queued)

        let next = store.save(
            selection: selection,
            race: makeUnlockedRace(id: "after-normalization", round: 2),
            owner: .guest,
            now: RaceFixtures.now
        )
        guard case .saved(let nextRecord) = next else {
            return XCTFail("Expected a new record after syncing recovery")
        }
        XCTAssertEqual(nextRecord.revision, saved.revision + 1)
    }

    func testQueuedRecordsIncludeOnlyGuestAndCurrentUserQueuedStates() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let guest = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "guest-queued", round: 1),
            owner: .guest
        )
        let current = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "current-queued", round: 2),
            owner: .user("a")
        )
        let other = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "other-queued", round: 3),
            owner: .user("b")
        )
        let conflict = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "current-conflict", round: 4),
            owner: .user("a")
        )
        let expired = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "guest-expired", round: 5),
            owner: .guest
        )
        let confirmed = try saveRecord(
            in: store,
            race: makeUnlockedRace(id: "current-confirmed", round: 6),
            owner: .user("a")
        )
        XCTAssertTrue(
            store.transition(
                id: conflict.id,
                revision: conflict.revision,
                to: .conflict(.accountPickFound)
            )
        )
        XCTAssertTrue(
            store.transition(id: expired.id, revision: expired.revision, to: .expired)
        )
        XCTAssertTrue(
            store.transition(
                id: confirmed.id,
                revision: confirmed.revision,
                to: .confirmed
            )
        )

        let queued = store.queuedRecords(currentUserID: "a")

        XCTAssertEqual(store.queuedRecords(currentUserID: nil).map(\.id), [guest.id])
        XCTAssertEqual(queued.map(\.id), [guest.id, current.id])
        XCTAssertFalse(queued.map(\.id).contains(other.id))
        XCTAssertFalse(queued.map(\.id).contains(conflict.id))
        XCTAssertFalse(queued.map(\.id).contains(expired.id))
        XCTAssertFalse(queued.map(\.id).contains(confirmed.id))
    }

    func testTransitionRejectsStaleRevisionWithoutChangingNewerRecord() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        var store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let initial = try saveRecord(
            in: store,
            race: RaceFixtures.liveSpa,
            owner: .user("a")
        )
        let updatedSelection = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "leclerc",
            dnfDriverID: "norris"
        )
        let update = store.save(
            selection: updatedSelection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now.addingTimeInterval(1)
        )
        guard case .saved(let updated) = update else {
            return XCTFail("Expected changed selections to create a revision")
        }

        XCTAssertFalse(
            store.transition(id: initial.id, revision: initial.revision, to: .confirmed)
        )
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), updated)
        XCTAssertFalse(
            store.transition(
                id: updated.id,
                revision: updated.revision,
                to: .syncing(revision: updated.revision + 1, mode: .direct)
            )
        )
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), updated)

        store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), updated)
        XCTAssertTrue(
            store.transition(
                id: updated.id,
                revision: updated.revision,
                to: .syncing(revision: updated.revision, mode: .direct)
            )
        )
    }

    func testLockBoundaryAcceptsBeforeAndRejectsAtOrAfterWithoutConsumingRevisions() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let race = RaceFixtures.race(
            id: "exact-lock",
            round: 1,
            status: .upcoming,
            startOffset: 120
        )

        let before = store.save(
            selection: selection,
            race: race,
            owner: .guest,
            now: RaceFixtures.now.addingTimeInterval(-0.001)
        )
        let atCutoff = store.save(
            selection: selection,
            race: race,
            owner: .user("at-cutoff")
        )
        let afterCutoff = store.save(
            selection: selection,
            race: race,
            owner: .user("after-cutoff"),
            now: RaceFixtures.now.addingTimeInterval(0.001)
        )
        let secondAccepted = store.save(
            selection: selection,
            race: race,
            owner: .user("before-cutoff"),
            now: RaceFixtures.now.addingTimeInterval(-0.001)
        )

        guard case .saved(let first) = before,
              case .saved(let second) = secondAccepted
        else { return XCTFail("Expected saves before cutoff to succeed") }
        XCTAssertEqual(atCutoff, .locked)
        XCTAssertEqual(afterCutoff, .locked)
        XCTAssertEqual(first.revision, 1)
        XCTAssertEqual(second.revision, 2)
        XCTAssertNil(store.record(for: race.id, owner: .user("at-cutoff")))
        XCTAssertNil(store.record(for: race.id, owner: .user("after-cutoff")))
    }

    func testRecordModelCodableRoundTripsAssociatedOwnerAndStateCases() throws {
        let records = [
            LocalPickRecord(
                id: LocalPickRecordID(owner: .guest, raceID: "guest"),
                selection: selection,
                savedAt: RaceFixtures.now,
                revision: 1,
                syncState: .queued
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .user("a"), raceID: "user"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(1),
                revision: 2,
                syncState: .syncing(revision: 2, mode: .direct)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .legacyAmbiguous, raceID: "migration"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(2),
                revision: 3,
                syncState: .syncing(revision: 3, mode: .guestMigration)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .guest, raceID: "retry"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(3),
                revision: 4,
                syncState: .syncing(revision: 4, mode: .authenticatedRetry)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .user("b"), raceID: "confirmed"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(4),
                revision: 5,
                syncState: .confirmed
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .legacyAmbiguous, raceID: "server-wins"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(5),
                revision: 6,
                syncState: .conflict(.serverWins)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .guest, raceID: "account-found"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(6),
                revision: 7,
                syncState: .conflict(.accountPickFound)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .user("c"), raceID: "legacy"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(7),
                revision: 8,
                syncState: .conflict(.legacyNeedsReview)
            ),
            LocalPickRecord(
                id: LocalPickRecordID(owner: .legacyAmbiguous, raceID: "expired"),
                selection: selection,
                savedAt: RaceFixtures.now.addingTimeInterval(8),
                revision: 9,
                syncState: .expired
            ),
        ]

        let data = try JSONEncoder().encode(records)
        let decoded = try JSONDecoder().decode([LocalPickRecord].self, from: data)

        XCTAssertEqual(decoded, records)
    }

    func testExplicitConflictResaveCreatesNewQueuedRevision() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let initial = try saveRecord(
            in: store,
            race: RaceFixtures.liveSpa,
            owner: .user("a")
        )
        XCTAssertTrue(
            store.transition(
                id: initial.id,
                revision: initial.revision,
                to: .conflict(.accountPickFound)
            )
        )

        let result = store.save(
            selection: selection,
            race: RaceFixtures.liveSpa,
            owner: .user("a"),
            now: RaceFixtures.now.addingTimeInterval(1)
        )
        guard case .saved(let retried) = result else {
            return XCTFail("Expected explicit conflict recovery to create a revision")
        }

        XCTAssertEqual(retried.revision, initial.revision + 1)
        XCTAssertEqual(retried.syncState, .queued)
    }

    func testLegacyRaceOnlyWrappersOperateOnGuestRecordOnly() throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let store = LocalPickStore(defaults: context.defaults, clock: TestClock.fixed)
        let account = try saveRecord(
            in: store,
            race: RaceFixtures.liveSpa,
            owner: .user("a")
        )
        let legacy = LocalPick(
            raceId: "spa",
            winnerId: "leclerc",
            p10Id: "norris",
            dnfId: "piastri",
            savedAt: RaceFixtures.now,
            synced: false,
            migrationStatus: nil
        )

        XCTAssertNil(store.pick(for: "spa"))
        XCTAssertTrue(store.unsyncedPicks().isEmpty)
        store.markSynced(raceId: "spa")
        store.markMigrationExpired(raceId: "spa")
        store.remove(raceId: "spa")
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), account)

        XCTAssertTrue(store.save(legacy, race: RaceFixtures.liveSpa))
        XCTAssertEqual(store.pick(for: "spa")?.winnerId, "leclerc")
        XCTAssertEqual(store.unsyncedPicks().map(\.raceId), ["spa"])

        store.markSynced(raceId: "spa")
        XCTAssertTrue(store.pick(for: "spa")?.synced == true)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), account)

        store.markMigrationExpired(raceId: "spa")
        XCTAssertEqual(store.pick(for: "spa")?.migrationStatus, .expired)
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), account)

        store.remove(raceId: "spa")
        XCTAssertNil(store.pick(for: "spa"))
        XCTAssertEqual(store.record(for: "spa", owner: .user("a")), account)
    }

    private var selection: PickSelection {
        PickSelection(
            winnerDriverID: "norris",
            tenthPlaceDriverID: "piastri",
            dnfDriverID: "leclerc"
        )
    }

    private func makeUnlockedRace(id: String, round: Int) -> Race {
        RaceFixtures.race(
            id: id,
            round: round,
            status: .upcoming,
            startOffset: 3_600
        )
    }

    private func saveRecord(
        in store: LocalPickStore,
        race: Race,
        owner: PickOwnerScope
    ) throws -> LocalPickRecord {
        let result = store.save(
            selection: selection,
            race: race,
            owner: owner,
            now: RaceFixtures.now
        )
        guard case .saved(let record) = result else {
            throw TestFailure.expectedSavedRecord
        }
        return record
    }

    private func makeDefaults() -> DefaultsContext {
        let suiteName = "LocalPickStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return DefaultsContext(defaults: defaults, suiteName: suiteName)
    }
}

private struct DefaultsContext {
    let defaults: UserDefaults
    let suiteName: String

    func cleanUp() {
        defaults.removePersistentDomain(forName: suiteName)
    }
}

private enum TestFailure: Error {
    case expectedSavedRecord
}

@MainActor
private final class LocalPickPersistenceSpy: LocalPickPersisting {
    var rejectsWrites: Bool
    private var values: [String: Data] = [:]

    init(rejectsWrites: Bool = false) {
        self.rejectsWrites = rejectsWrites
    }

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

    func seed(_ data: Data, forKey key: String) {
        values[key] = data
    }
}

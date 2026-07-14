import Foundation

enum LocalPickMigrationStatus: String, Codable, Sendable {
    case expired
}

/// The ownerless on-device format used before composite owner/race records.
struct LegacyLocalPickV1: Codable, Sendable {
    let raceId: String
    let winnerId: String
    let p10Id: String
    let dnfId: String
    let savedAt: Date
    var synced: Bool
    var migrationStatus: LocalPickMigrationStatus?

    init(
        raceId: String,
        winnerId: String,
        p10Id: String,
        dnfId: String,
        savedAt: Date,
        synced: Bool,
        migrationStatus: LocalPickMigrationStatus? = nil
    ) {
        self.raceId = raceId
        self.winnerId = winnerId
        self.p10Id = p10Id
        self.dnfId = dnfId
        self.savedAt = savedAt
        self.synced = synced
        self.migrationStatus = migrationStatus
    }
}

/// Temporary source compatibility for SyncManager and RaceDetailViewModel.
/// Task 5/6 replace their ownerless entry points with record IDs and revisions.
typealias LocalPick = LegacyLocalPickV1

@MainActor
protocol LocalPickPersisting: AnyObject {
    func data(forKey key: String) -> Data?
    func setData(_ data: Data, forKey key: String)
    func removeData(forKey key: String)
}

extension UserDefaults: LocalPickPersisting {
    func setData(_ data: Data, forKey key: String) {
        set(data, forKey: key)
    }

    func removeData(forKey key: String) {
        removeObject(forKey: key)
    }
}

private struct LocalPickEnvelopeV2: Codable {
    static let currentSchemaVersion = 2

    let schemaVersion: Int
    let nextRevision: UInt64
    let records: [LocalPickRecord]
}

/// Owner-scoped, revision-checked local pick persistence.
@Observable
@MainActor
final class LocalPickStore {
    private static let v2Key = "localPicks_v2"
    private static let v1Key = "localPicks_v1"
    private static let legacyKey = "localPicks"

    private let persistence: any LocalPickPersisting
    private let clock: any ClockProviding
    private var records: [LocalPickRecordID: LocalPickRecord] = [:]
    private var nextRevision: UInt64 = 1
    private(set) var expiredMigrationNoticeCount = 0

    init(
        defaults: UserDefaults = .standard,
        clock: any ClockProviding = SystemClock()
    ) {
        persistence = defaults
        self.clock = clock
        load()
    }

    init(
        persistence: any LocalPickPersisting,
        clock: any ClockProviding
    ) {
        self.persistence = persistence
        self.clock = clock
        load()
    }

    // MARK: - Owner-scoped reads

    func record(for raceID: String, owner: PickOwnerScope) -> LocalPickRecord? {
        records[LocalPickRecordID(owner: owner, raceID: raceID)]
    }

    func record(id: LocalPickRecordID) -> LocalPickRecord? {
        records[id]
    }

    func legacyConflict(for raceID: String) -> LocalPickRecord? {
        guard let record = record(for: raceID, owner: .legacyAmbiguous),
              record.syncState == .conflict(.legacyNeedsReview)
        else { return nil }
        return record
    }

    func queuedRecords(currentUserID: String?) -> [LocalPickRecord] {
        records.values
            .filter { record in
                record.syncState == .queued
                    && isEligibleOwner(record.id.owner, currentUserID: currentUserID)
            }
            .sorted { $0.revision < $1.revision }
    }

    private func isEligibleOwner(
        _ owner: PickOwnerScope,
        currentUserID: String?
    ) -> Bool {
        switch owner {
        case .guest:
            return true
        case .user(let userID):
            return userID == currentUserID
        case .legacyAmbiguous:
            return false
        }
    }

    // MARK: - Owner-scoped mutations

    @discardableResult
    func save(
        selection: PickSelection,
        race: Race,
        owner: PickOwnerScope,
        now: Date? = nil
    ) -> LocalPickSaveResult {
        let savedAt = now ?? clock.now()
        guard savedAt < race.lockCutoffUtc else {
            return .locked
        }

        let id = LocalPickRecordID(owner: owner, raceID: race.id)
        if let existing = records[id], existing.selection == selection {
            switch existing.syncState {
            case .conflict, .expired:
                break
            case .queued, .syncing, .confirmed:
                return .unchanged(existing)
            }
        }

        let revision = nextRevision
        nextRevision &+= 1
        let record = LocalPickRecord(
            id: id,
            selection: selection,
            savedAt: savedAt,
            revision: revision,
            syncState: .queued
        )
        records[id] = record
        _ = persistV2()
        return .saved(record)
    }

    @discardableResult
    func transition(
        id: LocalPickRecordID,
        revision: UInt64,
        to syncState: LocalPickSyncState
    ) -> Bool {
        guard var record = records[id], record.revision == revision else {
            return false
        }
        if case .syncing(let stateRevision, _) = syncState,
           stateRevision != revision {
            return false
        }

        let newlyExpired = record.syncState != .expired && syncState == .expired
        record.syncState = syncState
        records[id] = record
        if newlyExpired {
            expiredMigrationNoticeCount += 1
        }
        _ = persistV2()
        return true
    }

    // MARK: - Guest-only compatibility

    /// Ownerless compatibility views intentionally expose guest records only.
    var picks: [String: LocalPick] {
        Dictionary(
            uniqueKeysWithValues: records.values.compactMap { record in
                guard record.id.owner == .guest else { return nil }
                return (record.id.raceID, legacyPick(from: record))
            }
        )
    }

    func pick(for raceId: String) -> LocalPick? {
        guard let record = record(for: raceId, owner: .guest) else {
            return nil
        }
        return legacyPick(from: record)
    }

    func unsyncedPicks() -> [LocalPick] {
        records.values
            .filter { $0.id.owner == .guest && $0.syncState == .queued }
            .sorted { $0.revision < $1.revision }
            .map(legacyPick(from:))
    }

    @discardableResult
    func save(_ pick: LocalPick, race: Race) -> Bool {
        let selection = PickSelection(
            winnerDriverID: pick.winnerId,
            tenthPlaceDriverID: pick.p10Id,
            dnfDriverID: pick.dnfId
        )
        return save(
            selection: selection,
            race: race,
            owner: .guest,
            now: clock.now()
        ) != .locked
    }

    func markSynced(raceId: String) {
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        guard let record = records[id] else { return }
        _ = transition(id: id, revision: record.revision, to: .confirmed)
    }

    func markMigrationExpired(raceId: String) {
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        guard let record = records[id] else { return }
        _ = transition(id: id, revision: record.revision, to: .expired)
    }

    func clearExpiredMigrationNotice() {
        expiredMigrationNoticeCount = 0
    }

    func remove(raceId: String) {
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        guard records.removeValue(forKey: id) != nil else { return }
        _ = persistV2()
    }

    private func legacyPick(from record: LocalPickRecord) -> LocalPick {
        let isConfirmed = record.syncState == .confirmed
        let migrationStatus: LocalPickMigrationStatus? = record.syncState == .expired
            ? .expired
            : nil
        return LocalPick(
            raceId: record.id.raceID,
            winnerId: record.selection.winnerDriverID,
            p10Id: record.selection.tenthPlaceDriverID,
            dnfId: record.selection.dnfDriverID,
            savedAt: record.savedAt,
            synced: isConfirmed,
            migrationStatus: migrationStatus
        )
    }

    // MARK: - Persistence

    private func load() {
        if let v2Data = persistence.data(forKey: Self.v2Key) {
            guard let envelope = try? JSONDecoder().decode(
                LocalPickEnvelopeV2.self,
                from: v2Data
            ), envelope.schemaVersion == LocalPickEnvelopeV2.currentSchemaVersion
            else {
                // Preserve unsupported/corrupt future data rather than overwriting it.
                return
            }

            for record in envelope.records {
                if let existing = records[record.id], existing.revision >= record.revision {
                    continue
                }
                records[record.id] = record
            }
            let highestRevision = records.values.map(\.revision).max() ?? 0
            nextRevision = max(envelope.nextRevision, highestRevision + 1, 1)

            var normalizedSyncing = false
            for id in Array(records.keys) {
                guard var record = records[id] else { continue }
                if case .syncing = record.syncState {
                    record.syncState = .queued
                    records[id] = record
                    normalizedSyncing = true
                }
            }
            if normalizedSyncing {
                _ = persistV2()
            }

            // A decodable v2 read is proof that a prior write completed.
            persistence.removeData(forKey: Self.v1Key)
            persistence.removeData(forKey: Self.legacyKey)
            return
        }

        migrateLegacyIfPresent()
    }

    private func migrateLegacyIfPresent() {
        let sourceData = persistence.data(forKey: Self.v1Key)
            ?? persistence.data(forKey: Self.legacyKey)
        guard let sourceData,
              let legacyPicks = try? JSONDecoder().decode(
                  [String: LegacyLocalPickV1].self,
                  from: sourceData
              )
        else { return }

        for raceID in legacyPicks.keys.sorted() {
            guard let legacy = legacyPicks[raceID] else { continue }
            let id = LocalPickRecordID(owner: .legacyAmbiguous, raceID: legacy.raceId)
            let syncState: LocalPickSyncState = legacy.migrationStatus == .expired
                ? .expired
                : .conflict(.legacyNeedsReview)
            records[id] = LocalPickRecord(
                id: id,
                selection: PickSelection(
                    winnerDriverID: legacy.winnerId,
                    tenthPlaceDriverID: legacy.p10Id,
                    dnfDriverID: legacy.dnfId
                ),
                savedAt: legacy.savedAt,
                revision: nextRevision,
                syncState: syncState
            )
            nextRevision &+= 1
        }

        guard persistV2() else { return }
        persistence.removeData(forKey: Self.v1Key)
        persistence.removeData(forKey: Self.legacyKey)
    }

    @discardableResult
    private func persistV2() -> Bool {
        let envelope = LocalPickEnvelopeV2(
            schemaVersion: LocalPickEnvelopeV2.currentSchemaVersion,
            nextRevision: nextRevision,
            records: records.values.sorted { $0.revision < $1.revision }
        )
        guard let data = try? JSONEncoder().encode(envelope) else {
            return false
        }
        persistence.setData(data, forKey: Self.v2Key)
        return persistence.data(forKey: Self.v2Key) == data
    }
}

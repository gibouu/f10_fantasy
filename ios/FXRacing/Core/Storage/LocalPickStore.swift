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
    let revision: UInt64?

    init(
        raceId: String,
        winnerId: String,
        p10Id: String,
        dnfId: String,
        savedAt: Date,
        synced: Bool,
        migrationStatus: LocalPickMigrationStatus? = nil,
        revision: UInt64? = nil
    ) {
        self.raceId = raceId
        self.winnerId = winnerId
        self.p10Id = p10Id
        self.dnfId = dnfId
        self.savedAt = savedAt
        self.synced = synced
        self.migrationStatus = migrationStatus
        self.revision = revision
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
    private var canPersistV2 = true
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
        guard owner != .legacyAmbiguous else {
            return .invalidOwner
        }
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

        let previousRecord = records[id]
        let previousNextRevision = nextRevision
        let revision = previousNextRevision
        let (incrementedRevision, overflow) = previousNextRevision.addingReportingOverflow(1)
        guard previousNextRevision > 0,
              !overflow,
              incrementedRevision < .max
        else {
            return .persistenceFailed
        }
        nextRevision = incrementedRevision
        let record = LocalPickRecord(
            id: id,
            selection: selection,
            savedAt: savedAt,
            revision: revision,
            syncState: .queued
        )
        records[id] = record
        guard persistV2() else {
            nextRevision = previousNextRevision
            if let previousRecord {
                records[id] = previousRecord
            } else {
                records[id] = nil
            }
            return .persistenceFailed
        }
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
        switch record.syncState {
        case .confirmed, .conflict, .expired:
            return false
        case .queued, .syncing:
            break
        }
        if case .syncing(let stateRevision, _) = syncState,
           stateRevision != revision {
            return false
        }

        let previousRecord = record
        let newlyExpired = syncState == .expired
        record.syncState = syncState
        records[id] = record
        guard persistV2() else {
            records[id] = previousRecord
            return false
        }
        if newlyExpired {
            expiredMigrationNoticeCount += 1
        }
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
        switch save(
            selection: selection,
            race: race,
            owner: .guest,
            now: clock.now()
        ) {
        case .saved, .unchanged:
            return true
        case .locked, .invalidOwner, .persistenceFailed:
            return false
        }
    }

    @discardableResult
    func markSynced(raceId: String, revision: UInt64?) -> Bool {
        guard let revision else { return false }
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        return transition(id: id, revision: revision, to: .confirmed)
    }

    @discardableResult
    func markMigrationExpired(raceId: String, revision: UInt64?) -> Bool {
        guard let revision else { return false }
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        return transition(id: id, revision: revision, to: .expired)
    }

    func clearExpiredMigrationNotice() {
        expiredMigrationNoticeCount = 0
    }

    @discardableResult
    func remove(raceId: String) -> Bool {
        let id = LocalPickRecordID(owner: .guest, raceID: raceId)
        guard let removed = records.removeValue(forKey: id) else { return false }
        guard persistV2() else {
            records[id] = removed
            return false
        }
        return true
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
            migrationStatus: migrationStatus,
            revision: record.revision
        )
    }

    // MARK: - Persistence

    private func load() {
        if let v2Data = persistence.data(forKey: Self.v2Key) {
            guard let envelope = try? JSONDecoder().decode(
                LocalPickEnvelopeV2.self,
                from: v2Data
            ), envelope.schemaVersion == LocalPickEnvelopeV2.currentSchemaVersion,
               isValid(envelope)
            else {
                // Preserve unsupported/corrupt future data rather than overwriting it.
                canPersistV2 = false
                return
            }

            for record in envelope.records {
                records[record.id] = record
            }
            nextRevision = envelope.nextRevision

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
        guard let legacyPicks = decodedLegacyPicks(forKey: Self.v1Key)
                ?? decodedLegacyPicks(forKey: Self.legacyKey)
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
            let (incrementedRevision, overflow) = nextRevision.addingReportingOverflow(1)
            guard nextRevision > 0, !overflow else {
                records.removeAll()
                canPersistV2 = false
                return
            }
            nextRevision = incrementedRevision
        }

        // Keep v1 for this process. A later initialization must decode v2 before
        // either legacy key is removed, so an acknowledged in-memory write alone
        // can never destroy the only durable copy.
        _ = persistV2()
    }

    private func decodedLegacyPicks(
        forKey key: String
    ) -> [String: LegacyLocalPickV1]? {
        guard let data = persistence.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(
            [String: LegacyLocalPickV1].self,
            from: data
        )
    }

    private func isValid(_ envelope: LocalPickEnvelopeV2) -> Bool {
        guard envelope.nextRevision > 0, envelope.nextRevision < .max else {
            return false
        }

        var ids = Set<LocalPickRecordID>()
        var revisions = Set<UInt64>()
        var highestRevision: UInt64 = 0

        for record in envelope.records {
            guard record.revision > 0,
                  ids.insert(record.id).inserted,
                  revisions.insert(record.revision).inserted
            else { return false }

            if case .syncing(let stateRevision, _) = record.syncState,
               stateRevision != record.revision {
                return false
            }
            highestRevision = max(highestRevision, record.revision)
        }

        return envelope.nextRevision > highestRevision
    }

    @discardableResult
    private func persistV2() -> Bool {
        guard canPersistV2 else { return false }
        let envelope = LocalPickEnvelopeV2(
            schemaVersion: LocalPickEnvelopeV2.currentSchemaVersion,
            nextRevision: nextRevision,
            records: records.values.sorted { $0.revision < $1.revision }
        )
        guard isValid(envelope) else { return false }
        guard let data = try? JSONEncoder().encode(envelope) else {
            return false
        }
        persistence.setData(data, forKey: Self.v2Key)
        return persistence.data(forKey: Self.v2Key) == data
    }
}

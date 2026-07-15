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

private struct LocalAuthoritativePickRecord: Codable {
    let id: LocalPickRecordID
    let pick: Pick
}

private struct LocalPickEnvelopeV2: Codable {
    static let currentSchemaVersion = 2

    let schemaVersion: Int
    let nextRevision: UInt64
    let records: [LocalPickRecord]
    let authoritativePicks: [LocalAuthoritativePickRecord]

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case nextRevision
        case records
        case authoritativePicks
    }

    init(
        schemaVersion: Int,
        nextRevision: UInt64,
        records: [LocalPickRecord],
        authoritativePicks: [LocalAuthoritativePickRecord]
    ) {
        self.schemaVersion = schemaVersion
        self.nextRevision = nextRevision
        self.records = records
        self.authoritativePicks = authoritativePicks
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        nextRevision = try container.decode(UInt64.self, forKey: .nextRevision)
        records = try container.decode([LocalPickRecord].self, forKey: .records)
        authoritativePicks = try container.decodeIfPresent(
            [LocalAuthoritativePickRecord].self,
            forKey: .authoritativePicks
        ) ?? []
    }
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
    private var authoritativePicks: [LocalPickRecordID: Pick] = [:]
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

    func authoritativePick(
        for raceID: String,
        owner: PickOwnerScope
    ) -> Pick? {
        guard case .user = owner else { return nil }
        return authoritativePicks[
            LocalPickRecordID(owner: owner, raceID: raceID)
        ]
    }

    func queuedRecords(currentUserID: String?) -> [LocalPickRecord] {
        records.values
            .filter { record in
                record.syncState == .queued
                    && isEligibleOwner(record.id.owner, currentUserID: currentUserID)
            }
            .sorted { $0.revision < $1.revision }
    }

    /// Includes persisted in-flight records whose rollback could not be
    /// written, allowing the current process to recover without a relaunch.
    func retryableRecords(currentUserID: String?) -> [LocalPickRecord] {
        records.values
            .filter { record in
                let isRetryable: Bool
                switch record.syncState {
                case .queued, .syncing:
                    isRetryable = true
                case .reviewRequired, .confirmed, .conflict, .expired:
                    isRetryable = false
                }
                return isRetryable
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
    func preserveAuthoritative(
        _ pick: Pick,
        for owner: PickOwnerScope
    ) -> Bool {
        guard case .user = owner else { return false }
        let id = LocalPickRecordID(owner: owner, raceID: pick.raceId)
        let previous = authoritativePicks[id]
        authoritativePicks[id] = pick
        guard persistV2() else {
            authoritativePicks[id] = previous
            return false
        }
        return true
    }

    @discardableResult
    func clearAuthoritativePick(
        for raceID: String,
        owner: PickOwnerScope
    ) -> Bool {
        guard case .user = owner else { return false }
        let id = LocalPickRecordID(owner: owner, raceID: raceID)
        guard let removed = authoritativePicks.removeValue(forKey: id) else {
            return true
        }
        guard persistV2() else {
            authoritativePicks[id] = removed
            return false
        }
        return true
    }

    func recoverLegacyConflict(
        for race: Race,
        owner: PickOwnerScope,
        now: Date? = nil
    ) -> LegacyPickRecoveryResult {
        guard owner != .legacyAmbiguous else { return .invalidOwner }
        guard let legacy = legacyConflict(for: race.id) else { return .notFound }
        let savedAt = now ?? clock.now()
        guard savedAt < race.lockCutoffUtc else { return .locked }

        let destinationID = LocalPickRecordID(owner: owner, raceID: race.id)
        if let existing = records[destinationID] {
            return .destinationOccupied(existing)
        }

        let previousNextRevision = nextRevision
        let revision = previousNextRevision
        let (incrementedRevision, overflow) = revision.addingReportingOverflow(1)
        guard revision > 0, !overflow, incrementedRevision < .max else {
            return .persistenceFailed
        }

        let recovered = LocalPickRecord(
            id: destinationID,
            selection: legacy.selection,
            savedAt: savedAt,
            revision: revision,
            syncState: .reviewRequired
        )
        nextRevision = incrementedRevision
        records[destinationID] = recovered
        records[legacy.id] = nil

        guard persistV2() else {
            nextRevision = previousNextRevision
            records[destinationID] = nil
            records[legacy.id] = legacy
            return .persistenceFailed
        }
        return .recovered(recovered)
    }

    @discardableResult
    func save(
        selection: PickSelection,
        race: Race,
        owner: PickOwnerScope,
        now: Date? = nil,
        forceNewRevision: Bool = false
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
            case .reviewRequired:
                break
            case .conflict, .expired:
                break
            case .queued, .syncing:
                return .unchanged(existing)
            case .confirmed:
                if !forceNewRevision {
                    return .unchanged(existing)
                }
            }
        }

        return storeNewRecord(
            id: id,
            selection: selection,
            savedAt: savedAt,
            syncState: .queued
        )
    }

    /// Moves a captured dirty guest draft into the signed-in account outbox.
    /// Both mutations share one persisted envelope so the guest draft remains
    /// recoverable if the account write fails.
    func saveSupersedingGuestDraft(
        selection: PickSelection,
        race: Race,
        owner: PickOwnerScope,
        guestRevision: UInt64,
        now: Date? = nil
    ) -> LocalPickSaveResult {
        guard case .user = owner else { return .invalidOwner }
        let savedAt = now ?? clock.now()
        guard savedAt < race.lockCutoffUtc else { return .locked }

        let guestID = LocalPickRecordID(owner: .guest, raceID: race.id)
        guard let guestRecord = records[guestID],
              guestRecord.revision == guestRevision
        else { return .persistenceFailed }
        guard guestRecord.syncState != .confirmed else {
            return .persistenceFailed
        }

        return storeNewRecord(
            id: LocalPickRecordID(owner: owner, raceID: race.id),
            selection: selection,
            savedAt: savedAt,
            syncState: .queued,
            removing: guestRecord
        )
    }

    /// Reconciles an authoritative account pick into the local baseline.
    /// This is not a user edit, so it remains valid after the race cutoff.
    @discardableResult
    func reconcileConfirmed(
        selection: PickSelection,
        raceID: String,
        owner: PickOwnerScope,
        savedAt: Date? = nil
    ) -> LocalPickSaveResult {
        guard owner != .legacyAmbiguous else {
            return .invalidOwner
        }

        let id = LocalPickRecordID(owner: owner, raceID: raceID)
        if let existing = records[id],
           existing.selection == selection,
           existing.syncState == .confirmed {
            return .unchanged(existing)
        }

        return storeNewRecord(
            id: id,
            selection: selection,
            savedAt: savedAt ?? clock.now(),
            syncState: .confirmed
        )
    }

    private func storeNewRecord(
        id: LocalPickRecordID,
        selection: PickSelection,
        savedAt: Date,
        syncState: LocalPickSyncState,
        removing removedRecord: LocalPickRecord? = nil
    ) -> LocalPickSaveResult {
        let previousRecord = records[id]
        if let removedRecord,
           records[removedRecord.id] != removedRecord {
            return .persistenceFailed
        }
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
            syncState: syncState
        )
        records[id] = record
        if let removedRecord {
            records[removedRecord.id] = nil
        }
        guard persistV2() else {
            nextRevision = previousNextRevision
            if let previousRecord {
                records[id] = previousRecord
            } else {
                records[id] = nil
            }
            if let removedRecord {
                records[removedRecord.id] = removedRecord
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
        case .reviewRequired, .confirmed, .conflict, .expired:
            return false
        case .queued, .syncing:
            break
        }
        if case .syncing(let stateRevision, _) = syncState,
           stateRevision != revision {
            return false
        }

        let previousRecord = record
        let raisesMigrationExpiryNotice: Bool
        if syncState == .expired,
           case .syncing(_, .guestMigration) = record.syncState {
            raisesMigrationExpiryNotice = true
        } else {
            raisesMigrationExpiryNotice = false
        }
        record.syncState = syncState
        records[id] = record
        guard persistV2() else {
            records[id] = previousRecord
            return false
        }
        if raisesMigrationExpiryNotice {
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
            for record in envelope.authoritativePicks {
                authoritativePicks[record.id] = record.pick
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

        var authoritativeIDs = Set<LocalPickRecordID>()
        for record in envelope.authoritativePicks {
            guard case .user = record.id.owner,
                  record.id.raceID == record.pick.raceId,
                  authoritativeIDs.insert(record.id).inserted
            else { return false }
        }

        return envelope.nextRevision > highestRevision
    }

    @discardableResult
    private func persistV2() -> Bool {
        guard canPersistV2 else { return false }
        let envelope = LocalPickEnvelopeV2(
            schemaVersion: LocalPickEnvelopeV2.currentSchemaVersion,
            nextRevision: nextRevision,
            records: records.values.sorted { $0.revision < $1.revision },
            authoritativePicks: authoritativePicks.map {
                LocalAuthoritativePickRecord(id: $0.key, pick: $0.value)
            }.sorted {
                if $0.id.raceID == $1.id.raceID {
                    return String(describing: $0.id.owner)
                        < String(describing: $1.id.owner)
                }
                return $0.id.raceID < $1.id.raceID
            }
        )
        guard isValid(envelope) else { return false }
        guard let data = try? JSONEncoder().encode(envelope) else {
            return false
        }
        persistence.setData(data, forKey: Self.v2Key)
        return persistence.data(forKey: Self.v2Key) == data
    }
}

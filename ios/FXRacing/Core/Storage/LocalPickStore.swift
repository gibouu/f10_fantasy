import Foundation

enum LocalPickMigrationStatus: String, Codable, Sendable {
    case expired
}

/// A pick stored locally on-device before (or instead of) server upload.
struct LocalPick: Codable, Sendable {
    let raceId: String
    let winnerId: String
    let p10Id: String
    let dnfId: String
    let savedAt: Date
    var synced: Bool
    var migrationStatus: LocalPickMigrationStatus?
}

/// Persists picks to UserDefaults as a [raceId: LocalPick] dictionary.
/// Guest picks are stored here; after sign-in SyncManager uploads them.
@Observable
@MainActor
final class LocalPickStore {

    private static let key = "localPicks_v1"
    private static let legacyKey = "localPicks"
    private(set) var picks: [String: LocalPick] = [:]
    private(set) var expiredMigrationNoticeCount = 0

    init() {
        load()
    }

    // MARK: - Read

    func pick(for raceId: String) -> LocalPick? {
        picks[raceId]
    }

    func unsyncedPicks() -> [LocalPick] {
        picks.values.filter { !$0.synced && $0.migrationStatus == nil }
    }

    // MARK: - Write

    /// Save (create or overwrite) a pick. Refuses if the race is locked.
    @discardableResult
    func save(_ pick: LocalPick, race: Race) -> Bool {
        guard !race.isLocked else { return false }
        picks[pick.raceId] = pick
        persist()
        return true
    }

    func markSynced(raceId: String) {
        guard picks[raceId] != nil else { return }
        picks[raceId]?.synced = true
        picks[raceId]?.migrationStatus = nil
        persist()
    }

    func markMigrationExpired(raceId: String) {
        guard picks[raceId] != nil else { return }
        picks[raceId]?.synced = false
        picks[raceId]?.migrationStatus = .expired
        expiredMigrationNoticeCount += 1
        persist()
    }

    func clearExpiredMigrationNotice() {
        expiredMigrationNoticeCount = 0
    }

    /// Clear a pick (e.g., after confirmed server deletion or conflict resolution).
    func remove(raceId: String) {
        picks.removeValue(forKey: raceId)
        persist()
    }

    // MARK: - Persistence

    private func load() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode([String: LocalPick].self, from: data) {
            picks = decoded
            return
        }

        guard let legacyData = UserDefaults.standard.data(forKey: Self.legacyKey),
              let legacyPicks = try? JSONDecoder().decode([String: LocalPick].self, from: legacyData)
        else { return }

        picks = legacyPicks
        persist()
        UserDefaults.standard.removeObject(forKey: Self.legacyKey)
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(picks) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }
}

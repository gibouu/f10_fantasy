import Foundation

/// A pick stored locally on-device before (or instead of) server upload.
struct LocalPick: Codable, Sendable {
    let raceId: String
    let winnerId: String
    let p10Id: String
    let dnfId: String
    let savedAt: Date
    var synced: Bool
}

/// Persists picks to UserDefaults as a [raceId: LocalPick] dictionary.
/// Guest picks are stored here; after sign-in SyncManager uploads them.
@Observable
@MainActor
final class LocalPickStore {

    private static let key = "localPicks_v1"
    private(set) var picks: [String: LocalPick] = [:]

    init() {
        load()
    }

    // MARK: - Read

    func pick(for raceId: String) -> LocalPick? {
        picks[raceId]
    }

    func unsyncedPicks() -> [LocalPick] {
        picks.values.filter { !$0.synced }
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
        persist()
    }

    /// Clear a pick (e.g., after confirmed server deletion or conflict resolution).
    func remove(raceId: String) {
        picks.removeValue(forKey: raceId)
        persist()
    }

    // MARK: - Persistence

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([String: LocalPick].self, from: data)
        else { return }
        picks = decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(picks) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }
}

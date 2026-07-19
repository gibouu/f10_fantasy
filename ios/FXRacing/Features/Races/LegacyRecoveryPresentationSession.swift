import Foundation

@Observable
@MainActor
final class LegacyRecoveryPresentationSession {
    private struct Key: Hashable {
        let raceID: String
        let privateScopeID: String
    }

    private var claimed: Set<Key> = []

    func claim(raceID: String, privateScopeID: String) -> Bool {
        claimed.insert(
            Key(raceID: raceID, privateScopeID: privateScopeID)
        ).inserted
    }
}

import Foundation

/// Uploads unsynced local guest picks to the server after sign-in.
/// Server picks always win on conflict — a 200 on GET means skip.
@MainActor
final class SyncManager {

    private let api = APIClient()

    /// Call once immediately after sign-in completes.
    /// - Parameters:
    ///   - token: The authenticated Bearer token.
    ///   - localPickStore: The local pick store to read from and mark synced.
    ///   - races: Currently loaded race list (used for lock checks). May be empty;
    ///            picks for unknown races are attempted anyway — server enforces lock.
    func migrateGuestPicks(
        token: String,
        localPickStore: LocalPickStore,
        races: [Race] = []
    ) async {
        let unsynced = localPickStore.unsyncedPicks()
        guard !unsynced.isEmpty else { return }

        let raceMap = Dictionary(uniqueKeysWithValues: races.map { ($0.id, $0) })

        for localPick in unsynced {
            // Client-side lock check — skip if we know the race is locked
            if let race = raceMap[localPick.raceId], race.isLocked {
                localPickStore.markSynced(raceId: localPick.raceId)
                continue
            }

            // Check if server already has a pick (server wins on conflict)
            if await checkServerPick(raceId: localPick.raceId, token: token) {
                localPickStore.markSynced(raceId: localPick.raceId)
                continue
            }

            // Upload
            if await uploadPick(localPick, token: token) {
                localPickStore.markSynced(raceId: localPick.raceId)
            }
            // On network error → leave unsynced; will retry on next sign-in
        }
    }

    // MARK: - Private

    private func checkServerPick(raceId: String, token: String) async -> Bool {
        do {
            let _: PickWrapper = try await api.request(.pickForRace(raceId: raceId), token: token)
            return true
        } catch APIError.notFound {
            return false
        } catch {
            return false  // conservative — treat unknown errors as "no pick found"
        }
    }

    private func uploadPick(_ pick: LocalPick, token: String) async -> Bool {
        do {
            let _: PickWrapper = try await api.request(
                .submitPick(
                    raceId: pick.raceId,
                    tenthPlaceDriverId: pick.p10Id,
                    winnerDriverId: pick.winnerId,
                    dnfDriverId: pick.dnfId
                ),
                token: token
            )
            return true
        } catch APIError.serverError(let code, _) where code == 423 {
            return true  // race locked → no retry needed
        } catch {
            return false
        }
    }
}

private struct PickWrapper: Decodable, Sendable {
    let pick: Pick
}

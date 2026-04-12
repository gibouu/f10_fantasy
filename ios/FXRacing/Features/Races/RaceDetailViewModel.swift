import Foundation

@Observable
@MainActor
final class RaceDetailViewModel {
    var race: Race?
    var entrants: [Driver] = []
    var results: [RaceResult] = []

    /// Server-synced pick (nil for guests or before server responds)
    var serverPick: Pick?

    // Current pick slot selections
    var selectedWinner: Driver?
    var selectedP10: Driver?
    var selectedDNF: Driver?

    var isLoading    = false
    var isSubmitting = false
    var submitSuccess = false
    var isLocalOnly  = false  // true when pick exists locally but not yet on server
    var errorMessage: String?

    /// True when all 3 slots are filled with distinct drivers and the race is still open.
    var canSave: Bool {
        guard let race, !race.isLocked else { return false }
        guard let w = selectedWinner, let p = selectedP10, let d = selectedDNF else { return false }
        return Set([w.id, p.id, d.id]).count == 3
    }

    private let raceId: String
    private let api = APIClient()

    init(raceId: String) {
        self.raceId = raceId
    }

    // MARK: - Load

    func load(token: String?, localPickStore: LocalPickStore) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let detail: DetailResponse = try await api.request(.raceDetail(id: raceId))
            race    = detail.race
            entrants = detail.entrants
            results  = detail.results
        } catch {
            errorMessage = error.localizedDescription
            return
        }

        // Populate selections: server pick takes precedence over local pick
        if let token {
            do {
                let response: PickWrapper = try await api.request(.pickForRace(raceId: raceId), token: token)
                serverPick = response.pick
                isLocalOnly = false
                selectedWinner = entrants.first { $0.id == response.pick.winnerDriverId }
                selectedP10    = entrants.first { $0.id == response.pick.tenthPlaceDriverId }
                selectedDNF    = entrants.first { $0.id == response.pick.dnfDriverId }
                // Mark local pick synced if server has it
                localPickStore.markSynced(raceId: raceId)
                return
            } catch APIError.notFound {
                serverPick = nil
            } catch {
                serverPick = nil
            }
        }

        // Fall back to local pick
        if let local = localPickStore.pick(for: raceId) {
            isLocalOnly = !local.synced
            selectedWinner = entrants.first { $0.id == local.winnerId }
            selectedP10    = entrants.first { $0.id == local.p10Id }
            selectedDNF    = entrants.first { $0.id == local.dnfId }
        }
    }

    // MARK: - Select

    func select(driver: Driver, for slot: PickSlot) {
        submitSuccess = false
        errorMessage  = nil
        switch slot {
        case .winner: selectedWinner = driver
        case .p10:    selectedP10    = driver
        case .dnf:    selectedDNF    = driver
        }
    }

    // MARK: - Submit (local-first)

    func submit(token: String?, localPickStore: LocalPickStore) async {
        guard canSave,
              let race,
              let winner = selectedWinner,
              let p10    = selectedP10,
              let dnf    = selectedDNF
        else { return }

        // Final client-side lock check
        guard !race.isLocked else {
            errorMessage = "This race is now locked."
            Haptics.locked()
            return
        }

        isSubmitting  = true
        submitSuccess = false
        errorMessage  = nil
        defer { isSubmitting = false }

        // 1. Save locally first (always — provides instant feedback)
        let localPick = LocalPick(
            raceId: raceId,
            winnerId: winner.id,
            p10Id: p10.id,
            dnfId: dnf.id,
            savedAt: Date(),
            synced: false
        )
        let saved = localPickStore.save(localPick, race: race)
        guard saved else {
            errorMessage = "This race is now locked."
            Haptics.locked()
            return
        }
        isLocalOnly = true

        // 2. Upload to server if authenticated
        guard let token else {
            submitSuccess = true
            Haptics.success()
            return
        }

        do {
            let response: PickWrapper = try await api.request(
                .submitPick(
                    raceId: raceId,
                    tenthPlaceDriverId: p10.id,
                    winnerDriverId: winner.id,
                    dnfDriverId: dnf.id
                ),
                token: token
            )
            serverPick = response.pick
            isLocalOnly = false
            localPickStore.markSynced(raceId: raceId)
            submitSuccess = true
            Haptics.success()
        } catch APIError.serverError(let code, let msg) where code == 423 {
            // Server says locked — local pick was saved but can't be uploaded
            errorMessage = msg ?? "This race is now locked."
            Haptics.locked()
        } catch {
            // Network error: local save succeeded, server upload failed
            // Show success because the pick IS saved locally
            submitSuccess = true
            Haptics.success()
        }
    }
}

// MARK: - Private response shapes

private struct DetailResponse: Decodable, Sendable {
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
}

private struct PickWrapper: Decodable, Sendable {
    let pick: Pick
}

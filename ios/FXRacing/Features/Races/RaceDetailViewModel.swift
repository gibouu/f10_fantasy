import Foundation

@Observable
@MainActor
final class RaceDetailViewModel {
    var race: Race?
    var entrants: [Driver] = []
    var results: [RaceResult] = []
    var qualifyingResults: [QualifyingResultRow] = []

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

        fxLog(.race, "load raceId=\(raceId) token=\(token != nil)")
        do {
            let detail: DetailResponse = try await api.request(.raceDetail(id: raceId))
            race    = detail.race
            entrants = detail.entrants
            results  = detail.results
            qualifyingResults = detail.qualifyingResults ?? []
            fxLog(.race, "load OK status=\(detail.race.status.rawValue) entrants=\(detail.entrants.count) results=\(detail.results.count) qualifying=\(qualifyingResults.count) lockCutoff=\(detail.race.lockCutoffUtc.timeIntervalSinceNow)s")
            if detail.race.status == .completed && detail.results.isEmpty {
                fxWarn(.race, "load: race COMPLETED but results empty — ingestion may not have run")
            }
        } catch {
            errorMessage = error.localizedDescription
            fxError(.race, "load failed raceId=\(raceId): \(error.localizedDescription)")
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
                if selectedWinner == nil || selectedP10 == nil || selectedDNF == nil {
                    fxWarn(.pick, "server pick driver id not in entrants — winner=\(selectedWinner == nil ? "missing" : "ok") p10=\(selectedP10 == nil ? "missing" : "ok") dnf=\(selectedDNF == nil ? "missing" : "ok")")
                } else {
                    fxLog(.pick, "server pick loaded raceId=\(raceId)")
                }
                // Mark local pick synced if server has it
                localPickStore.markSynced(raceId: raceId)
                return
            } catch APIError.notFound {
                fxLog(.pick, "no server pick for raceId=\(raceId) — falling back to local")
                serverPick = nil
            } catch {
                fxWarn(.pick, "server pick fetch failed raceId=\(raceId): \(error.localizedDescription) — falling back to local")
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
        // Defensive: if the lock cutoff crossed while the picker sheet was open
        // (race-condition between bubble tap + driver selection), refuse the
        // selection rather than letting a "phantom pick" appear in the UI.
        if let race, race.isLocked {
            errorMessage = "This race is now locked — picks can no longer be changed."
            Haptics.locked()
            fxWarn(.pick, "select blocked: race \(race.id) became locked during sheet")
            return
        }
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
            fxLog(.pick, "submit OK raceId=\(raceId) winner=\(winner.code) p10=\(p10.code) dnf=\(dnf.code)")
            Haptics.success()
        } catch APIError.serverError(let code, let msg) where code == 423 {
            // Server says locked — local pick was saved but can't be uploaded
            errorMessage = msg ?? "This race is now locked."
            fxWarn(.pick, "submit locked (423) raceId=\(raceId) — local pick retained")
            Haptics.locked()
        } catch {
            // Network error: local save succeeded, server upload failed
            // Show success because the pick IS saved locally
            submitSuccess = true
            fxWarn(.pick, "submit network failure raceId=\(raceId): \(error.localizedDescription) — local pick retained for retry")
            Haptics.success()
        }
    }
}

// MARK: - Private response shapes

private struct DetailResponse: Decodable, Sendable {
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
    let qualifyingResults: [QualifyingResultRow]?
}

private struct PickWrapper: Decodable, Sendable {
    let pick: Pick
}

import Foundation
import SwiftUI

@Observable
@MainActor
final class RacesListViewModel {
    var races: [Race] = []
    var isLoading = false
    var errorMessage: String?

    var upcoming: [Race] {
        races.filter { $0.status == .upcoming || $0.status == .live }
    }

    /// Past races, most recent first.
    var past: [Race] {
        races
            .filter { $0.status == .completed }
            .sorted { $0.round > $1.round }
    }

    /// True when at least one race is currently live — used by the view to
    /// drive a 60-second silent refresh so users see the upcoming → past
    /// transition without manually pulling.
    var hasLiveRace: Bool {
        races.contains { $0.status == .live }
    }

    private let api = APIClient()

    func clearError() { errorMessage = nil }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: RacesResponse = try await api.request(.races)
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                races = response.races
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Silently refresh the list without flipping `isLoading` or surfacing
    /// errors. Used by the polling timer in the view; failures are ignored
    /// so transient network blips don't replace the visible list with an
    /// error banner.
    func silentRefresh() async {
        do {
            let response: RacesResponse = try await api.request(.races)
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                races = response.races
            }
        } catch {
            // intentionally silent
        }
    }
}

private struct RacesResponse: Decodable, Sendable {
    let races: [Race]
    let season: Season?
}

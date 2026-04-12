import Foundation

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

    private let api = APIClient()

    func clearError() { errorMessage = nil }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: RacesResponse = try await api.request(.races)
            races = response.races
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct RacesResponse: Decodable, Sendable {
    let races: [Race]
    let season: Season?
}

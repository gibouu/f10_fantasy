import Foundation

@Observable
@MainActor
final class LeaderboardViewModel {
    enum Scope: String, CaseIterable {
        case global, friends
        var label: String { rawValue.capitalized }
    }

    var rows: [LeaderboardRow] = []
    var userRank: Int? = nil
    var userRow: LeaderboardRow? = nil
    var isLoading = false
    var errorMessage: String? = nil
    var scope: Scope = .global

    private let client = APIClient()

    func load(token: String?) async {
        isLoading = true
        errorMessage = nil
        fxLog(.score, "leaderboard load scope=\(scope.rawValue)")
        do {
            let response: LeaderboardResponse = try await client.request(
                .leaderboard(scope: scope.rawValue, sort: "season"),
                token: token
            )
            rows = response.rows
            userRank = response.userRank
            userRow = response.userRow
            fxLog(.score, "leaderboard rows=\(response.rows.count) userRank=\(response.userRank.map(String.init) ?? "nil")")
        } catch {
            errorMessage = error.localizedDescription
            fxError(.score, "leaderboard load failed scope=\(scope.rawValue): \(error.localizedDescription)")
        }
        isLoading = false
    }

    func switchScope(to newScope: Scope, token: String?) async {
        scope = newScope
        await load(token: token)
    }
}

private struct LeaderboardResponse: Decodable, Sendable {
    let rows: [LeaderboardRow]
    let userRank: Int?
    let userRow: LeaderboardRow?
}

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
    private var loadGeneration = 0
    var scope: Scope = .global {
        didSet {
            guard oldValue != scope else { return }
            loadGeneration += 1
            isLoading = false
        }
    }

    private let client = APIClient()

    func load(token: String?) async {
        loadGeneration += 1
        let generation = loadGeneration
        let requestedScope = scope

        isLoading = true
        errorMessage = nil
        fxLog(.score, "leaderboard load scope=\(requestedScope.rawValue)")
        do {
            let response: LeaderboardResponse = try await client.request(
                .leaderboard(scope: requestedScope.rawValue, sort: "season"),
                token: token
            )
            guard generation == loadGeneration, scope == requestedScope else { return }
            rows = response.rows
            userRank = response.userRank
            userRow = response.userRow
            fxLog(.score, "leaderboard rows=\(response.rows.count) userRank=\(response.userRank.map(String.init) ?? "nil")")
        } catch {
            guard generation == loadGeneration, scope == requestedScope else { return }
            errorMessage = error.localizedDescription
            fxError(.score, "leaderboard load failed scope=\(requestedScope.rawValue): \(error.localizedDescription)")
        }
        if generation == loadGeneration, scope == requestedScope {
            isLoading = false
        }
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

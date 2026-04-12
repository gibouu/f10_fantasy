import Foundation

struct LeaderboardRow: Codable, Sendable, Identifiable {
    let rank: Int
    let userId: String
    let publicUsername: String?
    let avatarUrl: String?
    let teamLogoUrl: String?
    let teamColor: String?
    let totalScore: Int
    let exactTenthHits: Int
    let winnerHits: Int
    let dnfHits: Int

    var id: String { userId }
}

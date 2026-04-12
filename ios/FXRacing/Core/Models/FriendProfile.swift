import SwiftUI

/// Full profile response from GET /api/users/[userId].
struct FriendProfile: Decodable, Sendable {
    let user: ProfileUser
    let picks: [ProfilePick]
    let canViewPicks: Bool
}

struct ProfileUser: Decodable, Sendable {
    let id: String
    let publicUsername: String?
    let avatarUrl: String?
    let favoriteTeamSlug: String?
}

struct ProfilePick: Decodable, Sendable, Identifiable {
    let id: String
    let raceId: String
    let race: ProfileRace
    let slotSummaries: SlotSummaries
    let scoreBreakdown: ScoreBreakdown?
}

struct ProfileRace: Decodable, Sendable {
    let id: String
    let round: Int
    let name: String
    let country: String
    let type: String
    let status: String
    let scheduledStartUtc: Date
}

struct SlotSummaries: Decodable, Sendable {
    let p10: SlotEntry
    let winner: SlotEntry
    let dnf: SlotEntry
}

struct SlotEntry: Decodable, Sendable {
    let driver: SlotDriver?
    let score: Int
    let status: String  // "pending", "exact", "partial", "correct", "miss"
}

struct SlotDriver: Decodable, Sendable {
    let id: String
    let code: String
    let firstName: String
    let lastName: String
    let photoUrl: String?
    let teamName: String
    let teamColor: String
    let logoUrl: String?

    var photoFullURL: URL? {
        photoUrl.flatMap { URL(string: Config.apiBaseURL.absoluteString + $0) }
    }

    var teamLogoFullURL: URL? {
        logoUrl.flatMap { URL(string: Config.apiBaseURL.absoluteString + $0) }
    }

    var color: Color { Color(hex: teamColor) ?? .gray }

    var isHit: Bool {
        // Used by the view — decoded from the SlotEntry.status, not available here.
        false
    }
}

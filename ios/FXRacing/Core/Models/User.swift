import Foundation

struct User: Codable, Sendable, Equatable {
    let id: String
    let name: String?
    let email: String?
    let avatarUrl: String?
    let publicUsername: String?
    let usernameSet: Bool
    let usernameChangeUsed: Bool
    let favoriteTeamSlug: String?
    let tutorialDismissedAt: Date?
    let createdAt: Date

    /// Best available display name for UI labels.
    var displayName: String {
        publicUsername ?? name ?? "Anonymous"
    }
}

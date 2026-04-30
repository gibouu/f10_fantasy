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

    /// Returns a copy with the username set during onboarding.
    func withUsernameSet(_ newUsername: String) -> User {
        User(
            id: id,
            name: name,
            email: email,
            avatarUrl: avatarUrl,
            publicUsername: newUsername,
            usernameSet: true,
            usernameChangeUsed: usernameChangeUsed,
            favoriteTeamSlug: favoriteTeamSlug,
            tutorialDismissedAt: tutorialDismissedAt,
            createdAt: createdAt
        )
    }

    /// Returns a copy after the one-time username change.
    func withUsernameChanged(_ newUsername: String) -> User {
        User(
            id: id,
            name: name,
            email: email,
            avatarUrl: avatarUrl,
            publicUsername: newUsername,
            usernameSet: true,
            usernameChangeUsed: true,
            favoriteTeamSlug: favoriteTeamSlug,
            tutorialDismissedAt: tutorialDismissedAt,
            createdAt: createdAt
        )
    }
}

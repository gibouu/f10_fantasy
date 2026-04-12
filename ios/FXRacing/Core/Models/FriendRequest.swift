import Foundation

/// A user returned from the friends list or search results.
struct UserSummary: Codable, Sendable, Identifiable {
    let id: String
    let publicUsername: String?
    let avatarUrl: String?
    let teamLogoUrl: String?
    let teamColor: String?
}

/// A friend request (received or sent).
struct FriendRequest: Codable, Sendable, Identifiable {
    let id: String
    let requesterId: String
    let requesterUsername: String?
    let requesterAvatar: String?
    let addresseeId: String
    let addresseeUsername: String?
    let addresseeAvatar: String?
    let teamLogoUrl: String?
    let teamColor: String?
    let status: String
}

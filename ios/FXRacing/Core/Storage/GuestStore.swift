import Foundation

/// Local-only profile state for guest (unauthenticated) users.
/// - `localUsername` is a draft — never sent to server until sign-in.
/// - `localTeamSlug` is a permanent local preference (used as avatar slug).
///   It persists even after sign-in and is uploaded via PATCH /api/users/team.
@Observable
@MainActor
final class GuestStore {

    private enum Keys {
        static let username  = "guest_username"
        static let teamSlug  = "guest_team_slug"
    }

    var localUsername: String? {
        didSet { UserDefaults.standard.set(localUsername, forKey: Keys.username) }
    }

    var localTeamSlug: String? {
        didSet { UserDefaults.standard.set(localTeamSlug, forKey: Keys.teamSlug) }
    }

    init() {
        localUsername = UserDefaults.standard.string(forKey: Keys.username)
        localTeamSlug = UserDefaults.standard.string(forKey: Keys.teamSlug)
    }

    /// Clears the draft username after sign-in (once migrated or offered as prefill).
    func clearUsername() {
        localUsername = nil
    }
}

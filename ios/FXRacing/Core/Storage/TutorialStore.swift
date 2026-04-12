import Foundation

/// Tracks which first-time tutorial prompts have been seen.
/// Backed by UserDefaults — survives app restarts, cleared on reinstall.
/// Never shows tutorials for authenticated users: call markAllSeen() on sign-in.
@Observable
@MainActor
final class TutorialStore {

    var hasSeenWelcome: Bool {
        didSet { UserDefaults.standard.set(hasSeenWelcome, forKey: "tutorial_welcome") }
    }
    var hasSeenPickTutorial: Bool {
        didSet { UserDefaults.standard.set(hasSeenPickTutorial, forKey: "tutorial_pick") }
    }
    var hasSeenLeaderboardTutorial: Bool {
        didSet { UserDefaults.standard.set(hasSeenLeaderboardTutorial, forKey: "tutorial_leaderboard") }
    }
    var hasSeenFriendsTip: Bool {
        didSet { UserDefaults.standard.set(hasSeenFriendsTip, forKey: "tutorial_friends") }
    }

    init() {
        hasSeenWelcome             = UserDefaults.standard.bool(forKey: "tutorial_welcome")
        hasSeenPickTutorial        = UserDefaults.standard.bool(forKey: "tutorial_pick")
        hasSeenLeaderboardTutorial = UserDefaults.standard.bool(forKey: "tutorial_leaderboard")
        hasSeenFriendsTip          = UserDefaults.standard.bool(forKey: "tutorial_friends")
    }

    /// Call immediately when a user signs in so tutorials never appear for authenticated users.
    func markAllSeen() {
        hasSeenWelcome             = true
        hasSeenPickTutorial        = true
        hasSeenLeaderboardTutorial = true
        hasSeenFriendsTip          = true
    }
}

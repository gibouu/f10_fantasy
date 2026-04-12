import SwiftUI

struct RootView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(TutorialStore.self) private var tutorialStore

    var body: some View {
        Group {
            switch authManager.state {
            case .unknown:
                // Keychain check in progress — blank to avoid flicker
                Color(uiColor: .systemBackground).ignoresSafeArea()

            case .unauthenticated:
                // Guest mode — full app accessible, sign-in is contextual
                MainTabView()

            case .authenticated(let user) where !user.usernameSet:
                // Newly signed-in user has not set a username yet
                UsernamePickerView()

            case .authenticated:
                MainTabView()
            }
        }
        .onChange(of: authManager.isAuthenticated) { _, isAuth in
            if isAuth { tutorialStore.markAllSeen() }
        }
    }
}

// MARK: - Main tab shell

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                RacesListView()
            }
            .tabItem { Label("Races",   systemImage: "flag.2.crossed") }

            NavigationStack {
                LeaderboardView()
            }
            .tabItem { Label("Ranking", systemImage: "trophy") }

            NavigationStack {
                ProfileView()
            }
            .tabItem { Label("Me", systemImage: "person.circle") }
        }
        .tint(FXTheme.Colors.accent)
    }
}


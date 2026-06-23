import SwiftUI

struct RootView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(LocalPickStore.self) private var localPickStore
    @Environment(TutorialStore.self) private var tutorialStore
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var isShowingExpiredPickAlert = false
    @State private var expiredPickAlertCount = 0

    private var preferredColorScheme: ColorScheme? {
        switch colorSchemePreference {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    private var expiredPickAlertTitle: String {
        expiredPickAlertCount == 1 ? "Offline pick expired" : "Offline picks expired"
    }

    private var expiredPickAlertMessage: String {
        if expiredPickAlertCount == 1 {
            return "One offline pick could not sync because its race locked before you signed in."
        }
        return "\(expiredPickAlertCount) offline picks could not sync because their races locked before you signed in."
    }

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
        .preferredColorScheme(preferredColorScheme)
        .onChange(of: authManager.isAuthenticated) { _, isAuth in
            if isAuth { tutorialStore.markAllSeen() }
        }
        .onChange(of: localPickStore.expiredMigrationNoticeCount) { _, count in
            guard count > 0 else { return }
            expiredPickAlertCount = count
            isShowingExpiredPickAlert = true
        }
        .alert(expiredPickAlertTitle, isPresented: $isShowingExpiredPickAlert) {
            Button("OK", role: .cancel) {
                localPickStore.clearExpiredMigrationNotice()
            }
        } message: {
            Text(expiredPickAlertMessage)
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
